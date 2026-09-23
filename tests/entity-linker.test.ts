import test from 'node:test'
import assert from 'node:assert/strict'
import type { Observation, SceneEntity } from '../shared/domain.js'
import { EntityLinker } from '../server/engine/entity-linker.js'

function observation(overrides:Partial<Observation>={}):Observation {
  return {
    id:'obs_new',sceneId:'scene_1',lensId:'general',label:'Temporary curb barrier',canonicalLabel:'temporary_barrier',
    description:'Orange barrier narrows the route.',condition:'partial obstruction',severity:'medium',confidence:.93,
    state:'ai_observation',requiresReview:true,sourceModel:'fixture',capturedAt:'2026-09-23T12:00:00.000Z',
    evidence:[{assetId:'asset_current',region:{x:.4,y:.5,width:.2,height:.2}}],attributes:{material:'plastic',color:'orange'},
    createdAt:'2026-09-23T12:01:00.000Z',updatedAt:'2026-09-23T12:01:00.000Z',version:1,...overrides,
  }
}

function entity(overrides:Partial<SceneEntity>={}):SceneEntity {
  return {
    id:'ent_barrier',sceneId:'scene_1',canonicalLabel:'temporary_barrier',displayName:'Temporary curb barrier',
    aliases:['road barrier','orange barrier'],firstObservedAt:'2026-09-20T12:00:00.000Z',lastObservedAt:'2026-09-22T12:00:00.000Z',
    observationIds:['obs_old'],assetIds:['asset_old'],centroid:{x:.5,y:.6},stableAttributes:{material:'plastic',color:'orange'},
    createdAt:'2026-09-20T12:00:00.000Z',updatedAt:'2026-09-22T12:00:00.000Z',version:1,...overrides,
  }
}

test('rank prefers canonical label, nearby region, and matching attributes',()=>{
  const linker=new EntityLinker()
  const candidates=linker.rank(observation(),[
    entity(),
    entity({id:'ent_pole',canonicalLabel:'utility_pole',displayName:'Utility pole',aliases:['power pole'],centroid:{x:.9,y:.2},stableAttributes:{material:'wood'}}),
  ])
  assert.equal(candidates[0].entity.id,'ent_barrier')
  assert.equal(candidates[0].components.label,1)
  assert.equal(candidates[0].components.attributes,1)
  assert.ok(candidates[0].score>.9)
})

test('link updates a strong existing entity without duplicating ids',()=>{
  const result=new EntityLinker().link(observation(),[entity()])
  assert.equal(result.created,false)
  assert.equal(result.entity.id,'ent_barrier')
  assert.deepEqual(result.entity.observationIds,['obs_old','obs_new'])
  assert.deepEqual(result.entity.assetIds,['asset_old','asset_current'])
  assert.equal(result.entity.version,2)
  assert.ok(result.entity.aliases.includes('Temporary curb barrier'))
})

test('link creates a new entity when no candidate clears threshold',()=>{
  const result=new EntityLinker({matchThreshold:.85}).link(
    observation({canonicalLabel:'public_bench',label:'Public bench',attributes:{material:'steel'}}),
    [entity()],
  )
  assert.equal(result.created,true)
  assert.match(result.entity.id,/^ent_/)
  assert.equal(result.entity.canonicalLabel,'public_bench')
  assert.deepEqual(result.entity.observationIds,['obs_new'])
})

test('link creates a new entity for ambiguous near-tied candidates',()=>{
  const candidates=[entity({id:'ent_a'}),entity({id:'ent_b',centroid:{x:.51,y:.61}})]
  const result=new EntityLinker({ambiguityDelta:.2}).link(observation(),candidates)
  assert.equal(result.created,true)
  assert.equal(result.candidates.length,2)
  assert.ok(Math.abs(result.candidates[0].score-result.candidates[1].score)<.2)
})

test('rank excludes entities from other scenes',()=>{
  const ranked=new EntityLinker().rank(observation(),[entity({sceneId:'scene_other'})])
  assert.deepEqual(ranked,[])
})
