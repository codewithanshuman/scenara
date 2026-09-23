import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import type {
  KnowledgeQuery,
  KnowledgeQueryResult,
  ObservationKnowledgeCatalog,
  ObservationKnowledgeRule,
} from '../../shared/knowledge.js'
import { NotFoundError, ValidationError } from '../lib/errors.js'

function increment(record:Record<string,number>,key:string):void {
  record[key]=(record[key]??0)+1
}

function normalize(value:string):string {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim()
}

function searchable(rule:ObservationKnowledgeRule):string {
  return normalize([
    rule.id,rule.conceptId,rule.canonicalLabel,rule.displayLabel,rule.category,rule.summary,
    ...rule.aliases,...rule.negativeAliases,...rule.visualCues,...rule.searchTerms,
  ].join(' '))
}

export class KnowledgeCatalogStore {
  readonly path:string
  readonly catalog:ObservationKnowledgeCatalog
  readonly loadedAt:string
  readonly bytes:number
  private readonly byId:Map<string,ObservationKnowledgeRule>
  private readonly textIndex:Map<string,string>

  constructor(path=resolve(process.cwd(),'knowledge','observation-catalog.json')) {
    this.path=path
    let source:string
    try { source=readFileSync(path,'utf8') }
    catch (cause) { throw new ValidationError(`Knowledge catalog is unavailable at ${path}`,{cause:String(cause)}) }
    let parsed:unknown
    try { parsed=JSON.parse(source) }
    catch (cause) { throw new ValidationError('Knowledge catalog contains invalid JSON',{path,cause:String(cause)}) }
    this.assertCatalog(parsed)
    this.catalog=parsed
    this.loadedAt=new Date().toISOString()
    this.bytes=statSync(path).size
    this.byId=new Map(parsed.rules.map(rule=>[rule.id,rule]))
    this.textIndex=new Map(parsed.rules.map(rule=>[rule.id,searchable(rule)]))
  }

  metadata() {
    return {...this.catalog.metadata,loadedAt:this.loadedAt,bytes:this.bytes,path:this.path}
  }

  get(ruleId:string):ObservationKnowledgeRule {
    const rule=this.byId.get(ruleId)
    if(!rule)throw new NotFoundError('Knowledge rule',ruleId)
    return rule
  }

  findBest(conceptId:string,profile='balanced',temporalMode='single_capture'):ObservationKnowledgeRule|undefined {
    return this.byId.get(`${conceptId}.${profile}.${temporalMode}`)
      ?? this.catalog.rules.find(rule=>rule.conceptId===conceptId&&rule.profile===profile)
      ?? this.catalog.rules.find(rule=>rule.conceptId===conceptId)
  }

  query(query:KnowledgeQuery={}):KnowledgeQueryResult {
    const offset=Math.max(0,Math.floor(query.offset??0))
    const limit=Math.min(200,Math.max(1,Math.floor(query.limit??50)))
    const terms=normalize(query.text??'').split(' ').filter(Boolean)
    const filtered=this.catalog.rules.filter(rule=>{
      if(query.lensId&&rule.lensId!==query.lensId)return false
      if(query.profile&&rule.profile!==query.profile)return false
      if(query.temporalMode&&rule.temporalMode!==query.temporalMode)return false
      if(query.captureContext&&!rule.captureContexts.includes(query.captureContext))return false
      if(query.modality&&!rule.modalities.includes(query.modality))return false
      if(query.category&&rule.category!==query.category)return false
      if(terms.length&&!terms.every(term=>this.textIndex.get(rule.id)?.includes(term)))return false
      return true
    })
    const facets:KnowledgeQueryResult['facets']={lenses:{},profiles:{},temporalModes:{},categories:{},captureContexts:{}}
    for(const rule of filtered){
      increment(facets.lenses,rule.lensId)
      increment(facets.profiles,rule.profile)
      increment(facets.temporalModes,rule.temporalMode)
      increment(facets.categories,rule.category)
      for(const context of rule.captureContexts)increment(facets.captureContexts,context)
    }
    return {total:filtered.length,offset,limit,rules:filtered.slice(offset,offset+limit),facets}
  }

  promptContext(options:{lensId?:string;profile?:string;temporalMode?:string;conceptIds?:string[];maxRules?:number}):string {
    const selected=this.catalog.rules.filter(rule=>
      (!options.lensId||rule.lensId===options.lensId)
      &&(!options.profile||rule.profile===options.profile)
      &&(!options.temporalMode||rule.temporalMode===options.temporalMode)
      &&(!options.conceptIds?.length||options.conceptIds.includes(rule.conceptId)),
    ).slice(0,options.maxRules??12)
    if(!selected.length)return ''
    return ['SCENARA EVIDENCE POLICY',...selected.map(rule=>[
      `RULE ${rule.id}: ${rule.displayLabel}`,
      `CUES: ${rule.visualCues.join('; ')}`,
      `EXCLUDE: ${rule.exclusionCues.join('; ')}`,
      `FIELDS: ${rule.fields.map(field=>field.key).join(', ')}`,
      `REVIEW BELOW: ${rule.confidence.requireReviewBelow}`,
    ].join('\n'))].join('\n\n')
  }

  private assertCatalog(value:unknown):asserts value is ObservationKnowledgeCatalog {
    if(!value||typeof value!=='object')throw new ValidationError('Knowledge catalog root must be an object')
    const candidate=value as Partial<ObservationKnowledgeCatalog>
    if(!candidate.metadata||!Array.isArray(candidate.rules))throw new ValidationError('Knowledge catalog must contain metadata and rules')
    if(candidate.metadata.ruleCount!==candidate.rules.length)throw new ValidationError('Knowledge catalog rule count does not match its metadata')
    const ids=new Set<string>()
    for(const [index,rule] of candidate.rules.entries()){
      if(!rule||typeof rule.id!=='string'||!rule.conceptId)throw new ValidationError(`Knowledge rule ${index} is invalid`)
      if(ids.has(rule.id))throw new ValidationError(`Duplicate knowledge rule id: ${rule.id}`)
      ids.add(rule.id)
    }
  }
}
