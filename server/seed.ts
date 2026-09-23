import type {
  DatabaseShape, MediaAsset, Observation, ProvenanceEvent, Scene, SceneChange, SceneEntity,
  Transcript, User, Workspace,
} from '../shared/domain.js'
import { appendProvenance, assetFingerprint } from './engine/provenance.js'

const CREATED = '2026-09-23T12:12:00.000Z'
const SCENE_ID = 'scene_north_canal_018'
const WORKSPACE_ID = 'workspace_scenara_demo'
const USER_ID = 'user_anshuman'

function image(
  id: string,
  filename: string,
  capturedAt: string,
  localUrl: string,
  tags: string[],
): MediaAsset {
  return {
    id,
    sceneId: SCENE_ID,
    kind: 'image',
    origin: 'original',
    sourceFilename: filename,
    mimeType: 'image/png',
    sha256: `${id.replaceAll('_', '').padEnd(64, '0').slice(0, 64)}`,
    byteLength: 2_800_000,
    capturedAt,
    uploadedAt: CREATED,
    dimensions: { width: 1536, height: 1024 },
    localUrl,
    observationIds: [],
    provenanceEventIds: [],
    structuredMetadata: {
      scenara_scene_id: SCENE_ID,
      scenara_origin: 'original',
      capture_batch: capturedAt.slice(0, 10),
    },
    tags,
    version: 1,
  }
}

const assets: MediaAsset[] = [
  image('asset_before_wide', 'IMG_4198.png', '2026-09-17T04:12:00.000Z', '/assets/scene-before.png', ['street', 'baseline', 'wide']),
  image('asset_current_wide', 'IMG_4221.png', '2026-09-23T12:12:00.000Z', '/assets/scene-after.png', ['street', 'current', 'wide', 'review']),
  image('asset_current_detail', 'IMG_4224.png', '2026-09-23T12:14:00.000Z', '/assets/scene-after.png', ['barrier', 'curb', 'detail']),
  image('asset_access_detail', 'IMG_4226.png', '2026-09-23T12:16:00.000Z', '/assets/scene-after.png', ['accessibility', 'curb-ramp']),
  {
    id: 'asset_walkthrough', sceneId: SCENE_ID, kind: 'video', origin: 'original',
    sourceFilename: 'WALK_018.mp4', mimeType: 'video/mp4', sha256: 'a'.repeat(64), byteLength: 48_400_000,
    capturedAt: '2026-09-23T12:10:00.000Z', uploadedAt: CREATED,
    dimensions: { width: 1920, height: 1080, durationSeconds: 112, frameRate: 30 },
    posterUrl: '/assets/scene-after.png', localUrl: '/assets/scene-after.png', transcriptId: 'transcript_walkthrough',
    observationIds: [], provenanceEventIds: [], structuredMetadata: { scenara_scene_id: SCENE_ID, scenara_origin: 'original' },
    tags: ['walkthrough', 'field-audio', 'video'], version: 1,
  },
  {
    id: 'asset_field_audio', sceneId: SCENE_ID, kind: 'audio', origin: 'original',
    sourceFilename: 'FIELD_NOTE_018.m4a', mimeType: 'audio/mp4', sha256: 'b'.repeat(64), byteLength: 4_200_000,
    capturedAt: '2026-09-23T12:17:00.000Z', uploadedAt: CREATED,
    dimensions: { durationSeconds: 48, sampleRate: 48_000, channels: 1 }, transcriptId: 'transcript_audio',
    observationIds: [], provenanceEventIds: [], structuredMetadata: { scenara_scene_id: SCENE_ID, scenara_origin: 'original' },
    tags: ['field-note', 'audio'], version: 1,
  },
]

function observation(input: Partial<Observation> & Pick<Observation, 'id' | 'label' | 'canonicalLabel' | 'description' | 'capturedAt' | 'evidence'>): Observation {
  return {
    sceneId: SCENE_ID,
    lensId: 'general',
    confidence: 0.9,
    state: 'ai_observation',
    requiresReview: false,
    attributes: {},
    sourceModel: 'cloudinary-ai-vision/general',
    createdAt: CREATED,
    updatedAt: CREATED,
    version: 1,
    ...input,
  }
}

const observations: Observation[] = [
  observation({
    id: 'obs_barrier_current', entityId: 'entity_barrier', label: 'Temporary curb obstruction', canonicalLabel: 'temporary_barrier',
    description: 'An orange temporary barrier reduces the clear pedestrian path near the south-east curb.',
    condition: 'obstructing pedestrian path', severity: 'medium', confidence: 0.94, state: 'review', requiresReview: true,
    capturedAt: '2026-09-23T12:12:00.000Z', attributes: { color: 'orange', material: 'plastic', path_impact: 'partial', count: 1 },
    evidence: [
      { assetId: 'asset_current_wide', region: { x: 0.39, y: 0.43, width: 0.14, height: 0.14 }, note: 'Wide context view' },
      { assetId: 'asset_current_detail', region: { x: 0.37, y: 0.4, width: 0.2, height: 0.2 }, note: 'Closer supporting view' },
      { assetId: 'asset_walkthrough', frameTimeSeconds: 14, note: 'Barrier visible during approach' },
    ],
  }),
  observation({
    id: 'obs_pole_before', entityId: 'entity_pole', label: 'Utility pole', canonicalLabel: 'utility_pole',
    description: 'Wooden utility pole with overhead cables at the corner.', condition: 'stable', severity: 'none', confidence: 0.97,
    state: 'verified', capturedAt: '2026-09-17T04:12:00.000Z', attributes: { material: 'wood', alignment: 'vertical' },
    evidence: [{ assetId: 'asset_before_wide', region: { x: 0.84, y: 0.02, width: 0.12, height: 0.85 } }],
  }),
  observation({
    id: 'obs_pole_current', entityId: 'entity_pole', label: 'Utility pole', canonicalLabel: 'utility_pole',
    description: 'Pole alignment and overhead cable clearance appear unchanged.', condition: 'stable', severity: 'none', confidence: 0.98,
    state: 'verified', capturedAt: '2026-09-23T12:12:00.000Z', attributes: { material: 'wood', alignment: 'vertical' },
    evidence: [
      { assetId: 'asset_current_wide', region: { x: 0.84, y: 0.02, width: 0.12, height: 0.85 } },
      { assetId: 'asset_walkthrough', frameTimeSeconds: 44 },
    ],
  }),
  observation({
    id: 'obs_access_before', entityId: 'entity_curb_ramp', lensId: 'accessibility', label: 'Tactile curb ramp', canonicalLabel: 'curb_ramp',
    description: 'Curb ramp with yellow tactile paving and continuous path.', condition: 'clear', severity: 'none', confidence: 0.95,
    state: 'verified', capturedAt: '2026-09-17T04:12:00.000Z', attributes: { clear_width_m: 1.4, tactile_paving: true, obstruction: false },
    evidence: [{ assetId: 'asset_before_wide', region: { x: 0.55, y: 0.72, width: 0.16, height: 0.14 } }],
  }),
  observation({
    id: 'obs_access_current', entityId: 'entity_curb_ramp', lensId: 'accessibility', label: 'Tactile curb ramp', canonicalLabel: 'curb_ramp',
    description: 'Tactile curb ramp remains unobstructed with an estimated 1.4 metre clear width.', condition: 'clear', severity: 'none', confidence: 0.97,
    state: 'verified', capturedAt: '2026-09-23T12:16:00.000Z', attributes: { clear_width_m: 1.4, tactile_paving: true, obstruction: false },
    evidence: [
      { assetId: 'asset_current_wide', region: { x: 0.55, y: 0.72, width: 0.16, height: 0.14 } },
      { assetId: 'asset_access_detail', region: { x: 0.53, y: 0.7, width: 0.2, height: 0.18 } },
    ],
  }),
  observation({
    id: 'obs_garden_before', entityId: 'entity_rain_garden', lensId: 'environment', label: 'Curbside rain garden', canonicalLabel: 'rain_garden',
    description: 'Planted curbside rain garden with moderate vegetation coverage.', condition: 'healthy', severity: 'none', confidence: 0.89,
    state: 'verified', capturedAt: '2026-09-17T04:12:00.000Z', attributes: { vegetation_coverage_percent: 58, standing_water: false, litter: false },
    evidence: [{ assetId: 'asset_before_wide', region: { x: 0.58, y: 0.48, width: 0.26, height: 0.24 } }],
  }),
  observation({
    id: 'obs_garden_current', entityId: 'entity_rain_garden', lensId: 'environment', label: 'Curbside rain garden', canonicalLabel: 'rain_garden',
    description: 'Vegetation coverage increased while the basin remains free of visible standing water.', condition: 'healthy growth', severity: 'none', confidence: 0.91,
    state: 'ai_observation', capturedAt: '2026-09-23T12:12:00.000Z', attributes: { vegetation_coverage_percent: 70, standing_water: false, litter: false },
    evidence: [{ assetId: 'asset_current_wide', region: { x: 0.58, y: 0.48, width: 0.26, height: 0.24 } }],
  }),
  observation({
    id: 'obs_crosswalk_before', entityId: 'entity_crosswalk', lensId: 'safety', label: 'Marked crosswalk', canonicalLabel: 'crosswalk',
    description: 'Painted crosswalk with visible surface wear.', condition: 'moderate wear', severity: 'low', confidence: 0.9,
    state: 'verified', capturedAt: '2026-09-17T04:12:00.000Z', attributes: { paint_visibility_percent: 76, cracking: 'minor' },
    evidence: [{ assetId: 'asset_before_wide', region: { x: 0.08, y: 0.72, width: 0.52, height: 0.25 } }],
  }),
  observation({
    id: 'obs_crosswalk_current', entityId: 'entity_crosswalk', lensId: 'safety', label: 'Marked crosswalk', canonicalLabel: 'crosswalk',
    description: 'Crosswalk paint has slightly reduced visibility along two central stripes.', condition: 'advanced wear', severity: 'low', confidence: 0.86,
    state: 'review', requiresReview: true, capturedAt: '2026-09-23T12:12:00.000Z', attributes: { paint_visibility_percent: 69, cracking: 'minor' },
    evidence: [{ assetId: 'asset_current_wide', region: { x: 0.08, y: 0.72, width: 0.52, height: 0.25 } }],
  }),
]

const entities: SceneEntity[] = [
  { id: 'entity_barrier', sceneId: SCENE_ID, canonicalLabel: 'temporary_barrier', displayName: 'Temporary curb barrier', aliases: ['temporary barrier', 'road barrier', 'obstruction'], firstObservedAt: '2026-09-23T12:12:00.000Z', lastObservedAt: '2026-09-23T12:14:00.000Z', observationIds: ['obs_barrier_current'], assetIds: ['asset_current_wide', 'asset_current_detail', 'asset_walkthrough'], centroid: { x: .46, y: .5 }, stableAttributes: { color: 'orange', material: 'plastic' }, createdAt: CREATED, updatedAt: CREATED, version: 1 },
  { id: 'entity_pole', sceneId: SCENE_ID, canonicalLabel: 'utility_pole', displayName: 'Utility pole', aliases: ['pole', 'wooden pole'], firstObservedAt: '2026-09-17T04:12:00.000Z', lastObservedAt: '2026-09-23T12:12:00.000Z', observationIds: ['obs_pole_before', 'obs_pole_current'], assetIds: ['asset_before_wide', 'asset_current_wide', 'asset_walkthrough'], centroid: { x: .9, y: .44 }, stableAttributes: { material: 'wood', alignment: 'vertical' }, createdAt: CREATED, updatedAt: CREATED, version: 2 },
  { id: 'entity_curb_ramp', sceneId: SCENE_ID, canonicalLabel: 'curb_ramp', displayName: 'Tactile curb ramp', aliases: ['curb access', 'tactile ramp'], firstObservedAt: '2026-09-17T04:12:00.000Z', lastObservedAt: '2026-09-23T12:16:00.000Z', observationIds: ['obs_access_before', 'obs_access_current'], assetIds: ['asset_before_wide', 'asset_current_wide', 'asset_access_detail'], centroid: { x: .63, y: .79 }, stableAttributes: { tactile_paving: true }, createdAt: CREATED, updatedAt: CREATED, version: 2 },
  { id: 'entity_rain_garden', sceneId: SCENE_ID, canonicalLabel: 'rain_garden', displayName: 'Curbside rain garden', aliases: ['rain garden', 'planted basin', 'vegetation'], firstObservedAt: '2026-09-17T04:12:00.000Z', lastObservedAt: '2026-09-23T12:12:00.000Z', observationIds: ['obs_garden_before', 'obs_garden_current'], assetIds: ['asset_before_wide', 'asset_current_wide'], centroid: { x: .71, y: .6 }, stableAttributes: { standing_water: false, litter: false }, createdAt: CREATED, updatedAt: CREATED, version: 2 },
  { id: 'entity_crosswalk', sceneId: SCENE_ID, canonicalLabel: 'crosswalk', displayName: 'Marked crosswalk', aliases: ['pedestrian crossing', 'road markings'], firstObservedAt: '2026-09-17T04:12:00.000Z', lastObservedAt: '2026-09-23T12:12:00.000Z', observationIds: ['obs_crosswalk_before', 'obs_crosswalk_current'], assetIds: ['asset_before_wide', 'asset_current_wide'], centroid: { x: .34, y: .85 }, stableAttributes: { cracking: 'minor' }, createdAt: CREATED, updatedAt: CREATED, version: 2 },
]

const changes: SceneChange[] = [
  { id: 'change_barrier_appeared', sceneId: SCENE_ID, entityId: 'entity_barrier', afterObservationId: 'obs_barrier_current', kind: 'appeared', significance: 'meaningful', title: 'Temporary obstruction appeared', description: 'An orange curb barrier is visible in the current capture and absent from the baseline.', confidence: .94, firstSeenAt: '2026-09-23T12:12:00.000Z', lastSeenAt: '2026-09-23T12:14:00.000Z', evidenceAssetIds: ['asset_before_wide', 'asset_current_wide', 'asset_current_detail', 'asset_walkthrough'], requiresReview: true, createdAt: CREATED, version: 1 },
  { id: 'change_garden_growth', sceneId: SCENE_ID, entityId: 'entity_rain_garden', beforeObservationId: 'obs_garden_before', afterObservationId: 'obs_garden_current', kind: 'modified', significance: 'minor', title: 'Vegetation coverage increased', description: 'Estimated visible vegetation coverage increased from 58% to 70%.', confidence: .9, firstSeenAt: '2026-09-17T04:12:00.000Z', lastSeenAt: '2026-09-23T12:12:00.000Z', evidenceAssetIds: ['asset_before_wide', 'asset_current_wide'], requiresReview: false, createdAt: CREATED, version: 1 },
  { id: 'change_crosswalk_wear', sceneId: SCENE_ID, entityId: 'entity_crosswalk', beforeObservationId: 'obs_crosswalk_before', afterObservationId: 'obs_crosswalk_current', kind: 'modified', significance: 'minor', title: 'Crosswalk visibility decreased', description: 'Estimated paint visibility decreased from 76% to 69%.', confidence: .85, firstSeenAt: '2026-09-17T04:12:00.000Z', lastSeenAt: '2026-09-23T12:12:00.000Z', evidenceAssetIds: ['asset_before_wide', 'asset_current_wide'], requiresReview: true, createdAt: CREATED, version: 1 },
]

const transcripts: Transcript[] = [
  { id: 'transcript_walkthrough', assetId: 'asset_walkthrough', language: 'en', source: 'cloudinary', createdAt: CREATED, version: 1,
    text: 'Approaching the south-east corner. The temporary barrier narrows the path here. The curb ramp itself remains clear. The utility pole appears stable. The rain garden has filled out since the previous visit.',
    segments: [
      { id: 'segment_walk_001', text: 'Approaching the south-east corner.', startSeconds: 3.2, endSeconds: 7.8, linkedObservationIds: [] },
      { id: 'segment_walk_002', text: 'The temporary barrier narrows the path here.', startSeconds: 13.7, endSeconds: 18.9, linkedObservationIds: ['obs_barrier_current'] },
      { id: 'segment_walk_003', text: 'The curb ramp itself remains clear.', startSeconds: 24.1, endSeconds: 28.6, linkedObservationIds: ['obs_access_current'] },
      { id: 'segment_walk_004', text: 'The utility pole appears stable.', startSeconds: 43.8, endSeconds: 47.4, linkedObservationIds: ['obs_pole_current'] },
      { id: 'segment_walk_005', text: 'The rain garden has filled out since the previous visit.', startSeconds: 66.2, endSeconds: 73.1, linkedObservationIds: ['obs_garden_current'] },
    ] },
  { id: 'transcript_audio', assetId: 'asset_field_audio', language: 'en', source: 'cloudinary', createdAt: CREATED, version: 1,
    text: 'Follow up on barrier ownership. Confirm whether it can be shifted away from the accessible route before the morning peak.',
    segments: [
      { id: 'segment_audio_001', text: 'Follow up on barrier ownership.', startSeconds: 1.1, endSeconds: 4.7, linkedObservationIds: ['obs_barrier_current'] },
      { id: 'segment_audio_002', text: 'Confirm whether it can be shifted away from the accessible route before the morning peak.', startSeconds: 5.0, endSeconds: 12.8, linkedObservationIds: ['obs_barrier_current', 'obs_access_current'] },
    ] },
]

export function seedDatabase(): DatabaseShape {
  const workspace: Workspace = { id: WORKSPACE_ID, name: 'Scenara Field Lab', slug: 'scenara-field-lab', createdAt: CREATED, memberIds: [USER_ID] }
  const user: User = { id: USER_ID, name: 'Anshuman', initials: 'AB', role: 'owner', createdAt: CREATED }
  const scene: Scene = {
    id: SCENE_ID, sequence: 18, slug: 'north-canal-04', title: 'North Canal / Block 04',
    description: 'Urban resilience and accessibility inspection of the south-east canal approach.', status: 'review',
    locationLabel: 'Pune, Maharashtra', workspaceId: WORKSPACE_ID, coverAssetId: 'asset_current_wide',
    captureStart: '2026-09-17T04:12:00.000Z', captureEnd: '2026-09-23T12:17:00.000Z',
    createdAt: CREATED, updatedAt: CREATED, createdBy: USER_ID,
    activeLensIds: ['general', 'safety', 'accessibility', 'environment'],
    assetIds: assets.map(item => item.id), entityIds: entities.map(item => item.id), observationIds: observations.map(item => item.id),
    changeIds: changes.map(item => item.id), tags: ['urban-resilience', 'accessibility', 'field-inspection'], version: 4,
  }

  for (const item of observations) {
    for (const evidence of item.evidence) {
      const asset = assets.find(candidate => candidate.id === evidence.assetId)
      if (asset && !asset.observationIds.includes(item.id)) asset.observationIds.push(item.id)
    }
  }
  const provenance: ProvenanceEvent[] = []
  for (const asset of assets) {
    const fingerprint = assetFingerprint(asset)
    const event = appendProvenance(provenance, {
      sceneId: scene.id, assetId: asset.id, action: 'captured', actorType: 'human', actorId: USER_ID,
      inputFingerprint: asset.sha256, outputFingerprint: fingerprint,
      parameters: { capturedAt: asset.capturedAt, sourceFilename: asset.sourceFilename, origin: asset.origin },
    })
    provenance.push(event)
    asset.provenanceEventIds.push(event.id)
  }

  return {
    schemaVersion: 1, revision: 1, workspaces: [workspace], users: [user], scenes: [scene], assets,
    entities, observations, changes, transcripts, analyses: [], reviews: [], provenance, scenarios: [], jobs: [],
  }
}

export const seedIds = { scene: SCENE_ID, workspace: WORKSPACE_ID, user: USER_ID }
