import test from 'node:test'
import assert from 'node:assert/strict'
import { KnowledgeCatalogStore } from '../server/knowledge/catalog.js'
import { evaluateKnowledgePolicy } from '../server/engine/policy.js'

const catalog=new KnowledgeCatalogStore()

test('generated knowledge catalog is internally consistent',()=>{
  const metadata=catalog.metadata()
  assert.equal(metadata.ruleCount,688)
  assert.equal(metadata.conceptCount,86)
  assert.equal(catalog.catalog.rules.length,metadata.ruleCount)
  assert.ok(metadata.bytes>5_000_000)
  assert.equal(new Set(catalog.catalog.rules.map(rule=>rule.id)).size,metadata.ruleCount)
})

test('each concept has every profile and temporal mode',()=>{
  const groups=new Map<string,Set<string>>()
  for(const rule of catalog.catalog.rules){
    const values=groups.get(rule.conceptId)??new Set<string>()
    values.add(`${rule.profile}:${rule.temporalMode}`)
    groups.set(rule.conceptId,values)
  }
  assert.equal(groups.size,86)
  for(const [conceptId,variants] of groups){
    assert.equal(variants.size,8,`${conceptId} should expose eight policy variants`)
  }
})

test('knowledge query combines structured and text filters',()=>{
  const result=catalog.query({lensId:'accessibility',profile:'risk_sensitive',temporalMode:'change_detection',text:'curb',limit:10})
  assert.ok(result.total>=5)
  assert.ok(result.rules.length<=10)
  assert.ok(result.rules.every(rule=>rule.lensId==='accessibility'))
  assert.ok(result.rules.every(rule=>rule.profile==='risk_sensitive'))
  assert.ok(result.rules.every(rule=>rule.temporalMode==='change_detection'))
  assert.ok(result.facets.categories.accessible_crossing>=1)
})

test('catalog retrieves an exact rule and builds bounded prompt context',()=>{
  const rule=catalog.get('temporary_barrier.balanced.single_capture')
  assert.equal(rule.displayLabel,'Temporary curb barrier')
  assert.ok(rule.visualCues.includes('portable barrier'))
  assert.ok(rule.fields.some(field=>field.key==='condition'&&field.required))
  const prompt=catalog.promptContext({lensId:'general',profile:'balanced',temporalMode:'single_capture',conceptIds:['temporary_barrier'],maxRules:1})
  assert.match(prompt,/RULE temporary_barrier\.balanced\.single_capture/)
  assert.match(prompt,/CUES:/)
  assert.match(prompt,/REVIEW BELOW:/)
})

test('policy accepts well-supported high-confidence evidence',()=>{
  const rule=catalog.get('temporary_barrier.balanced.single_capture')
  const result=evaluateKnowledgePolicy(rule,{
    ruleId:rule.id,
    modelConfidence:.91,
    proposedSeverity:'medium',
    proposedState:'ai_observation',
    facts:[
      {key:'condition',value:'partial obstruction',confidence:.96},
      {key:'location_hint',value:'south-east curb',confidence:.93},
      {key:'occlusion',value:'none',confidence:.98},
      {key:'lighting',value:'daylight',confidence:.99},
    ],
    corroboratingSources:3,
    temporalAgreement:true,
    hasContradiction:false,
  })
  assert.equal(result.decision,'accept')
  assert.equal(result.requiresReview,false)
  assert.ok(result.adjustedConfidence>.91)
  assert.equal(result.missingRequiredFields.length,0)
})

test('policy sends incomplete or contradictory evidence to review',()=>{
  const rule=catalog.get('sidewalk_closure.risk_sensitive.change_detection')
  const result=evaluateKnowledgePolicy(rule,{
    ruleId:rule.id,
    modelConfidence:.86,
    proposedSeverity:'high',
    proposedState:'review',
    facts:[{key:'condition',value:'route closed',confidence:.91}],
    corroboratingSources:1,
    temporalAgreement:false,
    hasContradiction:true,
  })
  assert.equal(result.decision,'review')
  assert.equal(result.requiresReview,true)
  assert.ok(result.missingRequiredFields.includes('location_hint'))
  assert.ok(result.reviewReasons.some(reason=>reason.includes('contradiction')))
  assert.ok(result.appliedAdjustments.some(item=>item.kind==='contradiction'&&item.value<0))
})

test('policy suppresses unsupported low-confidence candidates',()=>{
  const rule=catalog.get('bench.high_precision.single_capture')
  const result=evaluateKnowledgePolicy(rule,{
    ruleId:rule.id,
    modelConfidence:.31,
    facts:[],
    corroboratingSources:0,
    temporalAgreement:false,
    hasContradiction:false,
  })
  assert.equal(result.decision,'suppress')
  assert.equal(result.requiresReview,false)
  assert.ok(result.missingRequiredFields.length>=4)
})

test('all rules carry evidence and provenance requirements',()=>{
  for(const rule of catalog.catalog.rules){
    assert.ok(rule.evidenceRequirements.length>=4,rule.id)
    assert.ok(rule.provenanceRequirements.includes('Original asset fingerprint'),rule.id)
    assert.match(rule.advisoryNotice,/not a legal code determination/i)
    assert.ok(rule.confidence.suppressBelow<rule.confidence.requireReviewBelow,rule.id)
    assert.ok(rule.confidence.requireReviewBelow<rule.confidence.autoAcceptAt,rule.id)
  }
})
