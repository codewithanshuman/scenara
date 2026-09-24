import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ScenaraApplication } from '../server/app.js'
import type { ServerConfig } from '../server/config.js'
import { JsonDatabase } from '../server/db/store.js'
import { seedDatabase } from '../server/seed.js'

test('serverless analysis runs to completion and persists its policy decision', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'scenara-analysis-'))
  try {
    const config: ServerConfig = {
      port: 1,
      dataPath: join(directory, 'db.json'),
      publicOrigin: 'http://127.0.0.1:5173',
      serverless: true,
      cloudinary: { uploadFolder: 'scenara-test', enabled: false },
    }
    const database = new JsonDatabase(config.dataPath)
    await database.initialize(seedDatabase())
    const app = new ScenaraApplication(config, database)

    const result = await app.analyzeAsset({
      assetId: 'asset_current_wide',
      lensId: 'accessibility',
      policyProfile: 'risk_sensitive',
      temporalMode: 'change_detection',
      force: true,
    })

    assert.equal(result.job.status, 'succeeded')
    const snapshot = database.snapshot()
    const completed = snapshot.analyses.find(item => item.id === result.analysis.id)
    assert.equal(completed?.status, 'succeeded')
    assert.equal(completed?.promptVersion, 'scene-observation-v2-policy-grounded')
    const observation = snapshot.observations.find(item => item.sourceAnalysisId === result.analysis.id)
    assert.ok(observation?.policy)
    assert.equal(observation.policy.profile, 'risk_sensitive')
    assert.equal(observation.policy.temporalMode, 'change_detection')
    assert.match(observation.policy.ruleId, /^curb_ramp\.risk_sensitive\.change_detection$/)
    assert.equal(observation.confidence, observation.policy.adjustedConfidence)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
