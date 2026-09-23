import test from 'node:test'
import assert from 'node:assert/strict'
import { appendProvenance, assetFingerprint, verifyProvenance } from '../server/engine/provenance.js'
import { seedDatabase } from '../server/seed.js'
import type { ProvenanceEvent } from '../shared/domain.js'

test('seed provenance chains verify for every asset',()=>{
  const database=seedDatabase()
  for(const asset of database.assets){
    const result=verifyProvenance(database.provenance,asset.id)
    assert.equal(result.valid,true,asset.id)
    assert.equal(result.checked,asset.provenanceEventIds.length)
  }
})

test('appended events link parent id and previous hash',()=>{
  const chain:ProvenanceEvent[]=[]
  const first=appendProvenance(chain,{sceneId:'scene',assetId:'asset',action:'captured',actorType:'human',actorId:'analyst',inputFingerprint:'camera',outputFingerprint:'sha-a'})
  chain.push(first)
  const second=appendProvenance(chain,{sceneId:'scene',assetId:'asset',action:'analyzed',actorType:'system',actorId:'engine',inputFingerprint:'sha-a',outputFingerprint:'sha-b',parameters:{model:'vision'}})
  chain.push(second)
  assert.equal(second.parentEventId,first.id)
  assert.equal(second.previousHash,first.hash)
  assert.equal(verifyProvenance(chain).valid,true)
})

test('tampering with parameters invalidates an event hash',()=>{
  const event=appendProvenance([],{sceneId:'scene',assetId:'asset',action:'uploaded',actorType:'provider',actorId:'cloudinary',inputFingerprint:'a',outputFingerprint:'b',parameters:{folder:'evidence'}})
  const tampered={...event,parameters:{folder:'rewritten'}}
  const result=verifyProvenance([tampered])
  assert.equal(result.valid,false)
  assert.equal(result.brokenEventId,event.id)
  assert.equal(result.reason,'Event hash mismatch')
})

test('broken parent link is detected independently of event content hash',()=>{
  const first=appendProvenance([],{sceneId:'scene',assetId:'asset',action:'captured',actorType:'human',actorId:'a',inputFingerprint:'x',outputFingerprint:'y'})
  const legitimateSecond=appendProvenance([first],{sceneId:'scene',assetId:'asset',action:'analyzed',actorType:'system',actorId:'b',inputFingerprint:'y',outputFingerprint:'z'})
  const unrelated=appendProvenance([],{sceneId:'scene',assetId:'asset',action:'reviewed',actorType:'human',actorId:'c',inputFingerprint:'q',outputFingerprint:'r'})
  const result=verifyProvenance([first,unrelated,legitimateSecond])
  assert.equal(result.valid,false)
  assert.match(result.reason??'',/Parent|First event/)
})

test('asset fingerprint changes when material asset identity changes',()=>{
  const asset=seedDatabase().assets[0]
  const fingerprint=assetFingerprint(asset)
  const changed=assetFingerprint({...asset,byteLength:asset.byteLength+1})
  assert.equal(fingerprint.length,64)
  assert.notEqual(fingerprint,changed)
})
