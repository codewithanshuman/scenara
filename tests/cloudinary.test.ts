import test from 'node:test'
import assert from 'node:assert/strict'
import { CloudinaryClient } from '../server/integrations/cloudinary.js'
import type { MediaAsset } from '../shared/domain.js'

const asset: MediaAsset = {
  id: 'asset_source', sceneId: 'scene_source', kind: 'image', origin: 'original',
  sourceFilename: 'source.jpg', mimeType: 'image/jpeg', sha256: 'a'.repeat(64), byteLength: 100,
  capturedAt: '2026-09-24T00:00:00.000Z', uploadedAt: '2026-09-24T00:00:00.000Z',
  dimensions: { width: 1200, height: 800 }, observationIds: [], provenanceEventIds: [],
  structuredMetadata: {}, tags: [], version: 1,
  cloudinary: {
    assetId: 'cloudinary-asset', publicId: 'scenara/source', version: 7,
    resourceType: 'image', deliveryType: 'upload', secureUrl: 'https://example.test/source.jpg',
    format: 'jpg', bytes: 100,
  },
}

const client = new CloudinaryClient({
  cloudName: 'demo-cloud', apiKey: 'key', apiSecret: 'secret', uploadFolder: 'scenara', enabled: true,
})

test('scenario delivery produces a real immutable generative transformation URL', () => {
  const result = client.buildScenarioDelivery(asset, 'remove', 'Remove the barrier', { target: 'orange barrier' })
  assert.equal(result.provider, 'cloudinary')
  assert.match(result.url, /^https:\/\/res\.cloudinary\.com\/demo-cloud\/image\/upload\//)
  assert.match(result.url, /e_gen_remove:prompt_orange%20barrier;remove-shadow_true/)
  assert.match(result.url, /SIMULATED/)
  assert.match(result.url, /v7\/scenara\/source\.jpg$/)
})

test('scenario delivery uses typed parameters for replace and fill', () => {
  const replace = client.buildScenarioDelivery(asset, 'replace', 'ignored', { target: 'traffic cone', replacement: 'planter' })
  assert.match(replace.transformation, /e_gen_replace:from_traffic%20cone;to_planter;preserve-geometry_true/)
  const fill = client.buildScenarioDelivery(asset, 'fill', 'continue scene', { aspectRatio: '16:9', fillPrompt: 'continue streetscape' })
  assert.match(fill.transformation, /ar_16:9,c_pad,b_gen_fill:prompt_continue%20streetscape/)
})
