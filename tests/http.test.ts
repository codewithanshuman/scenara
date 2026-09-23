import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AddressInfo } from 'node:net'
import { JsonDatabase } from '../server/db/store.js'
import { seedDatabase } from '../server/seed.js'
import { ScenaraApplication } from '../server/app.js'
import { createHttpServer } from '../server/http.js'
import type { ServerConfig } from '../server/config.js'

async function withServer(run:(baseUrl:string)=>Promise<void>):Promise<void>{
  const directory=await mkdtemp(join(tmpdir(),'scenara-http-test-'))
  const config:ServerConfig={port:1,dataPath:join(directory,'db.json'),publicOrigin:'http://127.0.0.1:5173',cloudinary:{uploadFolder:'scenara-test',enabled:false}}
  const database=new JsonDatabase(config.dataPath)
  await database.initialize(seedDatabase())
  const server=createHttpServer(new ScenaraApplication(config,database))
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve())})
  const port=(server.address() as AddressInfo).port
  try{await run(`http://127.0.0.1:${port}`)}finally{
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))
    await rm(directory,{recursive:true,force:true})
  }
}

async function json(url:string,init?:RequestInit){
  const response=await fetch(url,init)
  return {response,payload:await response.json() as any}
}

test('health exposes persistence, adapter, and knowledge status',async()=>withServer(async base=>{
  const {response,payload}=await json(`${base}/api/health`)
  assert.equal(response.status,200)
  assert.equal(payload.data.status,'ok')
  assert.equal(payload.data.mode,'local-adapter')
  assert.equal(payload.data.counts.knowledgeRules,688)
  assert.ok(payload.meta.requestId.startsWith('req_'))
}))

test('scene endpoint returns a complete evidence workspace',async()=>withServer(async base=>{
  const {payload}=await json(`${base}/api/scenes/scene_north_canal_018`)
  assert.equal(payload.data.assets.length,6)
  assert.equal(payload.data.entities.length,5)
  assert.equal(payload.data.observations.length,9)
  assert.equal(payload.data.changes.length,3)
  assert.equal(payload.data.transcripts.length,2)
}))

test('knowledge query and policy evaluation work over HTTP',async()=>withServer(async base=>{
  const query=await json(`${base}/api/knowledge/rules?lensId=accessibility&profile=risk_sensitive&text=curb&limit=2`)
  assert.equal(query.response.status,200)
  assert.equal(query.payload.data.rules.length,2)
  const ruleId=query.payload.data.rules[0].id
  const evaluation=await json(`${base}/api/knowledge/evaluate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ruleId,modelConfidence:.72,proposedSeverity:'high',facts:[],corroboratingSources:1,temporalAgreement:false,hasContradiction:false})})
  assert.equal(evaluation.response.status,200)
  assert.equal(evaluation.payload.data.decision,'review')
  assert.ok(evaluation.payload.data.reviewReasons.length>0)
}))

test('search endpoint returns cross-modal evidence',async()=>withServer(async base=>{
  const {response,payload}=await json(`${base}/api/search`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:'barrier review',sceneIds:['scene_north_canal_018'],limit:10})})
  assert.equal(response.status,200)
  assert.equal(payload.data.hits.length,10)
  assert.equal(payload.data.hits[0].type,'observation')
}))

test('invalid JSON produces a structured service error',async()=>withServer(async base=>{
  const {response,payload}=await json(`${base}/api/search`,{method:'POST',headers:{'content-type':'application/json'},body:'{not valid'})
  assert.equal(response.status,400)
  assert.equal(payload.error.code,'INVALID_JSON')
  assert.equal(payload.error.retryable,false)
}))

test('unknown route returns a request-correlated 404',async()=>withServer(async base=>{
  const {response,payload}=await json(`${base}/api/does-not-exist`)
  assert.equal(response.status,404)
  assert.equal(payload.error.code,'ROUTE_NOT_FOUND')
  assert.ok(payload.meta.requestId.startsWith('req_'))
}))
