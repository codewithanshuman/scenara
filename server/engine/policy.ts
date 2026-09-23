import type {
  ObservationKnowledgeRule,
  PolicyEvaluationInput,
  PolicyEvaluationResult,
} from '../../shared/knowledge.js'
import type { ObservationSeverity } from '../../shared/knowledge.js'

const severityOrder:ObservationSeverity[]=['none','low','medium','high','critical']

function clamp(value:number):number {
  return Math.min(1,Math.max(0,Number(value.toFixed(4))))
}

function atLeast(actual:ObservationSeverity,threshold:ObservationSeverity):boolean {
  return severityOrder.indexOf(actual)>=severityOrder.indexOf(threshold)
}

function inferredSeverity(input:PolicyEvaluationInput,rule:ObservationKnowledgeRule):ObservationSeverity {
  if(input.proposedSeverity)return input.proposedSeverity
  const factMap=new Map(input.facts.map(fact=>[fact.key,fact.value]))
  const immediate=['guarded','clear_space','blocks_route','within_reach','sharp_edge','unstable']
  if(immediate.some(key=>factMap.get(key)===false)&&rule.review.reviewWhenSeverityAtLeast==='high')return'high'
  return'none'
}

export function evaluateKnowledgePolicy(rule:ObservationKnowledgeRule,input:PolicyEvaluationInput):PolicyEvaluationResult {
  const adjustments:PolicyEvaluationResult['appliedAdjustments']=[]
  let adjusted=clamp(input.modelConfidence)
  if(input.corroboratingSources>1){
    const multiplier=Math.min(3,input.corroboratingSources-1)
    const value=rule.confidence.corroborationBonus*multiplier
    adjusted=clamp(adjusted+value)
    adjustments.push({kind:'corroboration',value,explanation:`${input.corroboratingSources} independent evidence bindings support the finding.`})
  }
  if(input.temporalAgreement){
    adjusted=clamp(adjusted+rule.confidence.temporalAgreementBonus)
    adjustments.push({kind:'temporal_agreement',value:rule.confidence.temporalAgreementBonus,explanation:'The linked entity and condition are consistent across the comparison window.'})
  }
  if(input.hasContradiction){
    adjusted=clamp(adjusted-rule.confidence.contradictionPenalty)
    adjustments.push({kind:'contradiction',value:-rule.confidence.contradictionPenalty,explanation:'At least one evidence source contradicts the proposed condition.'})
  }
  const facts=new Map(input.facts.map(fact=>[fact.key,fact]))
  const required=rule.fields.filter(field=>field.required).map(field=>field.key)
  const missingRequiredFields=required.filter(key=>{
    const fact=facts.get(key)
    return !fact||fact.value===undefined||fact.value===null||fact.value===''||fact.confidence<rule.confidence.suppressBelow
  })
  const severity=inferredSeverity(input,rule)
  const reviewReasons:string[]=[]
  if(rule.review.alwaysReview)reviewReasons.push('The selected policy always requires review for this risk class.')
  if(adjusted<rule.confidence.requireReviewBelow)reviewReasons.push(`Adjusted confidence ${adjusted.toFixed(2)} is below the review threshold ${rule.confidence.requireReviewBelow.toFixed(2)}.`)
  if(missingRequiredFields.length)reviewReasons.push(`Required evidence fields are missing or weak: ${missingRequiredFields.join(', ')}.`)
  if(input.hasContradiction)reviewReasons.push('Evidence sources contain a material contradiction.')
  if(input.proposedState&&rule.review.reviewWhenStateIs.includes(input.proposedState))reviewReasons.push(`Observation state “${input.proposedState}” requires human review.`)
  if(atLeast(severity,rule.review.reviewWhenSeverityAtLeast))reviewReasons.push(`Severity “${severity}” meets the review escalation threshold.`)
  const decision:PolicyEvaluationResult['decision']=adjusted<rule.confidence.suppressBelow?'suppress':reviewReasons.length||adjusted<rule.confidence.autoAcceptAt?'review':'accept'
  return {ruleId:rule.id,adjustedConfidence:adjusted,decision,requiresReview:decision==='review',reviewReasons,missingRequiredFields,severity,appliedAdjustments:adjustments}
}
