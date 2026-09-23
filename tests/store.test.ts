import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { JsonDatabase } from '../server/db/store.js'
import { seedDatabase } from '../server/seed.js'

async function withDatabase(run:(database:JsonDatabase,file:string)=>Promise<void>):Promise<void>{
  const directory=await mkdtemp(join(tmpdir(),'scenara-store-test-'))
  const file=join(directory,'db.json')
  try{
    const database=new JsonDatabase(file)
    await database.initialize(seedDatabase())
    await run(database,file)
  }finally{
    await rm(directory,{recursive:true,force:true})
  }
}

test('initialization persists a complete seed atomically',async()=>withDatabase(async(database,file)=>{
  const snapshot=database.snapshot()
  assert.equal(snapshot.scenes.length,1)
  assert.equal(snapshot.assets.length,6)
  assert.equal(snapshot.observations.length,9)
  const persisted=JSON.parse(await readFile(file,'utf8'))
  assert.equal(persisted.schemaVersion,1)
  assert.equal(persisted.revision,snapshot.revision)
}))

test('snapshot returns an isolated deep clone',async()=>withDatabase(async database=>{
  const snapshot=database.snapshot()
  snapshot.scenes[0].title='mutated outside transaction'
  assert.notEqual(database.snapshot().scenes[0].title,snapshot.scenes[0].title)
}))

test('successful transaction increments revision and persists mutation',async()=>withDatabase(async(database,file)=>{
  const before=database.revision
  const returned=await database.transaction(draft=>{draft.scenes[0].tags.push('tested');return draft.scenes[0].id})
  assert.equal(returned,database.snapshot().scenes[0].id)
  assert.equal(database.revision,before+1)
  assert.ok(database.snapshot().scenes[0].tags.includes('tested'))
  assert.ok(JSON.parse(await readFile(file,'utf8')).scenes[0].tags.includes('tested'))
}))

test('optimistic revision rejects stale transaction',async()=>withDatabase(async database=>{
  const revision=database.revision
  await database.transaction(draft=>{draft.scenes[0].title='new title'})
  await assert.rejects(database.transaction(draft=>{draft.scenes[0].title='stale title'},revision),error=>{
    assert.equal((error as {code?:string}).code,'VERSION_CONFLICT')
    return true
  })
  assert.equal(database.snapshot().scenes[0].title,'new title')
}))

test('concurrent transactions serialize without lost updates',async()=>withDatabase(async database=>{
  const tasks=Array.from({length:12},(_,index)=>database.transaction(async draft=>{
    await Promise.resolve()
    draft.scenes[0].tags.push(`parallel-${index}`)
  }))
  await Promise.all(tasks)
  const tags=database.snapshot().scenes[0].tags
  for(let index=0;index<12;index+=1)assert.ok(tags.includes(`parallel-${index}`))
}))
