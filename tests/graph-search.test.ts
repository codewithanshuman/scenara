import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSceneGraph, neighborhood } from '../server/engine/graph.js'
import { searchDatabase } from '../server/engine/search.js'
import { seedDatabase } from '../server/seed.js'

const database=seedDatabase()
const sceneId=database.scenes[0].id

test('scene graph materializes all persisted evidence types',()=>{
  const graph=buildSceneGraph(database,sceneId)
  assert.equal(graph.nodes.length,26)
  assert.equal(graph.edges.length,50)
  for(const type of ['scene','asset','entity','observation','change','transcript']){
    assert.ok(graph.nodes.some(node=>node.type===type),type)
  }
  assert.equal(new Set(graph.nodes.map(node=>node.id)).size,graph.nodes.length)
})

test('graph edges reference existing nodes and carry bounded weights',()=>{
  const graph=buildSceneGraph(database,sceneId)
  const ids=new Set(graph.nodes.map(node=>node.id))
  for(const edge of graph.edges){
    assert.ok(ids.has(edge.source),edge.id)
    assert.ok(ids.has(edge.target),edge.id)
    assert.ok(edge.weight>=0&&edge.weight<=1,edge.id)
  }
})

test('neighborhood depth one is smaller than the complete graph',()=>{
  const graph=buildSceneGraph(database,sceneId)
  const root=database.entities[0].id
  const local=neighborhood(graph,root,1)
  assert.ok(local.nodes.length>1)
  assert.ok(local.nodes.length<graph.nodes.length)
  assert.ok(local.nodes.some(node=>node.id===root))
  assert.ok(local.edges.every(edge=>local.nodes.some(node=>node.id===edge.source)&&local.nodes.some(node=>node.id===edge.target)))
})

test('search ranks the barrier observation for barrier review query',()=>{
  const result=searchDatabase(database,{text:'barrier review',sceneIds:[sceneId],limit:20})
  assert.ok(result.total>=5)
  assert.equal(result.hits[0].type,'observation')
  assert.match(result.hits[0].title,/curb obstruction/i)
  assert.ok(result.facets.types.observation>=1)
  assert.ok(result.elapsedMs>=0)
})

test('search semantic intent finds review candidates',()=>{
  const result=searchDatabase(database,{text:'show evidence that requires human review',sceneIds:[sceneId],states:['review'],limit:50})
  assert.ok(result.hits.some(hit=>hit.type==='observation'&&hit.metadata.state==='review'))
  assert.ok(result.facets.states.review>=1)
})

test('search filters by evidence type and minimum confidence',()=>{
  const result=searchDatabase(database,{text:'curb',sceneIds:[sceneId],lensIds:['accessibility'],minConfidence:.9,limit:50})
  assert.ok(result.hits.length>=1)
  assert.ok(result.hits.every(hit=>hit.type==='observation'))
  assert.ok(result.hits.every(hit=>Number(hit.metadata.confidence??0)>=.9))
})

test('search pagination returns a deterministic non-overlapping window',()=>{
  const base={text:'',sceneIds:[sceneId],limit:4}
  const first=searchDatabase(database,base)
  assert.ok(first.nextCursor)
  const second=searchDatabase(database,{...base,cursor:first.nextCursor})
  assert.equal(first.hits.length,4)
  assert.equal(second.hits.length,4)
  assert.equal(first.total,second.total)
  assert.equal(first.hits.some(hit=>second.hits.some(other=>other.id===hit.id&&other.type===hit.type)),false)
})
