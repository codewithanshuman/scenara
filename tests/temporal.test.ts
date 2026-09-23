import test from 'node:test'
import assert from 'node:assert/strict'
import type { Observation, SceneEntity } from '../shared/domain.js'
import { compareEntityTimeline, compareObservations, materializeChange } from '../server/engine/temporal.js'

function obs(id:string,capturedAt:string,patch:Partial<Observation>={}):Observation {
  return {id,sceneId:'scene_1',lensId:'safety',label:'Marked crosswalk',canonicalLabel:'crosswalk',description:'Crosswalk condition.',condition:'clear',severity:'low',confidence:.9,state:'verified',requiresReview:false,sourceModel:'fixture',capturedAt,evidence:[{assetId:`asset_${id}`,region:{x:.2,y:.6,width:.4,height:.2}}],attributes:{visibility_percent:80},createdAt:capturedAt,updatedAt:capturedAt,version:1,...patch}
}

const entity:SceneEntity={id:'ent_crosswalk',sceneId:'scene_1',canonicalLabel:'crosswalk',displayName:'Marked crosswalk',aliases:['crossing'],firstObservedAt:'2026-09-01T00:00:00Z',lastObservedAt:'2026-09-23T00:00:00Z',observationIds:['before','after'],assetIds:['asset_before','asset_after'],stableAttributes:{},createdAt:'2026-09-01T00:00:00Z',updatedAt:'2026-09-23T00:00:00Z',version:1}

test('appeared finding inherits confidence and meaningful significance',()=>{
  const after=obs('after','2026-09-23T00:00:00Z')
  const comparison=compareObservations(undefined,after)
  assert.equal(comparison.kind,'appeared')
  assert.equal(comparison.significance,'meaningful')
  assert.equal(comparison.confidence,.9)
})

test('disappeared high-severity finding remains meaningful',()=>{
  const before=obs('before','2026-09-01T00:00:00Z',{severity:'high'})
  const comparison=compareObservations(before,undefined)
  assert.equal(comparison.kind,'disappeared')
  assert.equal(comparison.significance,'meaningful')
  assert.equal(comparison.confidence,.81)
})

test('attribute and condition changes materialize as meaningful modification',()=>{
  const before=obs('before','2026-09-01T00:00:00Z')
  const after=obs('after','2026-09-23T00:00:00Z',{condition:'advanced wear',severity:'medium',attributes:{visibility_percent:62,missing_segments:2}})
  const comparison=compareObservations(before,after)
  assert.equal(comparison.kind,'modified')
  assert.equal(comparison.significance,'meaningful')
  assert.equal(comparison.attributeChanges.length,2)
  assert.ok(comparison.reasons.some(reason=>reason.includes('Condition changed')))
  const change=materializeChange(entity,comparison)
  assert.equal(change.entityId,entity.id)
  assert.deepEqual(change.evidenceAssetIds,['asset_before','asset_after'])
  assert.match(change.title,/changed condition/)
})

test('spatial movement above tolerance is classified as moved',()=>{
  const before=obs('before','2026-09-01T00:00:00Z')
  const after=obs('after','2026-09-23T00:00:00Z',{evidence:[{assetId:'asset_after',region:{x:.7,y:.1,width:.2,height:.2}}]})
  const comparison=compareObservations(before,after)
  assert.equal(comparison.kind,'moved')
  assert.ok(comparison.reasons.some(reason=>reason.includes('moved by')))
})

test('identical observations remain unchanged and do not create timeline changes',()=>{
  const before=obs('before','2026-09-01T00:00:00Z')
  const after=obs('after','2026-09-23T00:00:00Z')
  assert.equal(compareObservations(before,after).kind,'unchanged')
  assert.deepEqual(compareEntityTimeline(entity,[after,before]),[])
})

test('timeline sorts observations chronologically before comparing',()=>{
  const before=obs('before','2026-09-01T00:00:00Z')
  const after=obs('after','2026-09-23T00:00:00Z',{condition:'worn',attributes:{visibility_percent:60}})
  const changes=compareEntityTimeline(entity,[after,before])
  assert.equal(changes.length,1)
  assert.equal(changes[0].beforeObservationId,'before')
  assert.equal(changes[0].afterObservationId,'after')
})

test('comparison rejects an empty input pair',()=>{
  assert.throws(()=>compareObservations(undefined,undefined),/At least one observation/)
})
