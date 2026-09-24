export type ISODateTime = string
export type UUID = string

export type SceneStatus = 'draft' | 'processing' | 'ready' | 'review' | 'archived'
export type AssetKind = 'image' | 'video' | 'audio' | 'document'
export type AssetOrigin = 'original' | 'derived' | 'generated'
export type ObservationState = 'ai_observation' | 'review' | 'verified' | 'dismissed'
export type ReviewDecision = 'verified' | 'corrected' | 'dismissed' | 'deferred'
export type ChangeKind = 'appeared' | 'disappeared' | 'modified' | 'moved' | 'unchanged'
export type ChangeSignificance = 'informational' | 'minor' | 'meaningful' | 'critical'
export type LensId = 'general' | 'safety' | 'accessibility' | 'environment' | 'inventory' | 'custom'
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
export type JobKind = 'upload' | 'analyze' | 'index' | 'transcribe' | 'compare' | 'derive' | 'scenario'
export type ProvenanceAction =
  | 'captured'
  | 'uploaded'
  | 'analyzed'
  | 'transformed'
  | 'transcribed'
  | 'reviewed'
  | 'generated'
  | 'exported'

export interface GeoPoint {
  latitude: number
  longitude: number
  altitudeMeters?: number
  accuracyMeters?: number
}

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export interface Point2D {
  x: number
  y: number
}

export interface CaptureDevice {
  manufacturer?: string
  model?: string
  software?: string
  focalLengthMm?: number
  orientation?: number
}

export interface Scene {
  id: UUID
  sequence: number
  slug: string
  title: string
  description: string
  status: SceneStatus
  locationLabel: string
  location?: GeoPoint
  workspaceId: UUID
  coverAssetId?: UUID
  captureStart: ISODateTime
  captureEnd: ISODateTime
  createdAt: ISODateTime
  updatedAt: ISODateTime
  createdBy: UUID
  activeLensIds: LensId[]
  assetIds: UUID[]
  entityIds: UUID[]
  observationIds: UUID[]
  changeIds: UUID[]
  tags: string[]
  version: number
}

export interface AssetDimensions {
  width?: number
  height?: number
  durationSeconds?: number
  frameRate?: number
  sampleRate?: number
  channels?: number
}

export interface CloudinaryIdentity {
  assetId: string
  publicId: string
  version: number
  resourceType: 'image' | 'video' | 'raw'
  deliveryType: string
  secureUrl: string
  format: string
  bytes: number
  etag?: string
}

export interface MediaAsset {
  id: UUID
  sceneId: UUID
  kind: AssetKind
  origin: AssetOrigin
  parentAssetId?: UUID
  sourceFilename: string
  mimeType: string
  sha256: string
  byteLength: number
  capturedAt: ISODateTime
  uploadedAt: ISODateTime
  device?: CaptureDevice
  location?: GeoPoint
  dimensions: AssetDimensions
  cloudinary?: CloudinaryIdentity
  localUrl?: string
  posterUrl?: string
  transcriptId?: UUID
  observationIds: UUID[]
  provenanceEventIds: UUID[]
  structuredMetadata: Record<string, string | number | boolean | string[] | null>
  tags: string[]
  version: number
}

export interface ObservationEvidence {
  assetId: UUID
  region?: BoundingBox
  frameTimeSeconds?: number
  transcriptSegmentId?: UUID
  cropUrl?: string
  note?: string
}

export interface ObservationPolicyAssessment {
  ruleId: string
  profile: 'balanced' | 'risk_sensitive' | 'high_precision' | 'rapid_screen'
  temporalMode: 'single_capture' | 'change_detection'
  decision: 'accept' | 'review' | 'suppress'
  modelConfidence: number
  adjustedConfidence: number
  corroboratingSources: number
  temporalAgreement: boolean
  hasContradiction: boolean
  reviewReasons: string[]
  missingRequiredFields: string[]
  appliedAdjustments: Array<{ kind: string; value: number; explanation: string }>
  evaluatedAt: ISODateTime
}

export interface Observation {
  id: UUID
  sceneId: UUID
  entityId?: UUID
  lensId: LensId
  label: string
  canonicalLabel: string
  description: string
  condition?: string
  severity?: 'none' | 'low' | 'medium' | 'high' | 'critical'
  confidence: number
  state: ObservationState
  requiresReview: boolean
  policy?: ObservationPolicyAssessment
  evidence: ObservationEvidence[]
  attributes: Record<string, string | number | boolean | string[] | null>
  sourceModel: string
  sourceAnalysisId?: UUID
  capturedAt: ISODateTime
  createdAt: ISODateTime
  updatedAt: ISODateTime
  reviewedAt?: ISODateTime
  reviewedBy?: UUID
  version: number
}

export interface SceneEntity {
  id: UUID
  sceneId: UUID
  canonicalLabel: string
  displayName: string
  aliases: string[]
  firstObservedAt: ISODateTime
  lastObservedAt: ISODateTime
  observationIds: UUID[]
  assetIds: UUID[]
  centroid?: Point2D
  stableAttributes: Record<string, string | number | boolean | string[] | null>
  createdAt: ISODateTime
  updatedAt: ISODateTime
  version: number
}

export interface SceneChange {
  id: UUID
  sceneId: UUID
  entityId?: UUID
  beforeObservationId?: UUID
  afterObservationId?: UUID
  kind: ChangeKind
  significance: ChangeSignificance
  title: string
  description: string
  confidence: number
  firstSeenAt: ISODateTime
  lastSeenAt: ISODateTime
  evidenceAssetIds: UUID[]
  requiresReview: boolean
  createdAt: ISODateTime
  version: number
}

export interface TranscriptWord {
  text: string
  startSeconds: number
  endSeconds: number
  confidence?: number
}

export interface TranscriptSegment {
  id: UUID
  text: string
  startSeconds: number
  endSeconds: number
  speaker?: string
  words?: TranscriptWord[]
  linkedObservationIds: UUID[]
}

export interface Transcript {
  id: UUID
  assetId: UUID
  language: string
  text: string
  segments: TranscriptSegment[]
  source: 'cloudinary' | 'manual' | 'imported'
  createdAt: ISODateTime
  version: number
}

export interface AnalysisRun {
  id: UUID
  sceneId: UUID
  assetId: UUID
  lensId: LensId
  status: JobStatus
  provider: 'cloudinary_ai_vision' | 'local_adapter'
  model: string
  promptVersion: string
  requestFingerprint: string
  rawResponse?: unknown
  observationIds: UUID[]
  startedAt?: ISODateTime
  completedAt?: ISODateTime
  error?: ServiceError
  createdAt: ISODateTime
  version: number
}

export interface ReviewRecord {
  id: UUID
  sceneId: UUID
  observationId: UUID
  reviewerId: UUID
  decision: ReviewDecision
  previousState: ObservationState
  nextState: ObservationState
  correction?: Partial<Pick<Observation, 'label' | 'description' | 'condition' | 'severity' | 'attributes'>>
  rationale?: string
  createdAt: ISODateTime
  observationVersion: number
}

export interface ProvenanceEvent {
  id: UUID
  sceneId: UUID
  assetId: UUID
  parentEventId?: UUID
  action: ProvenanceAction
  actorType: 'human' | 'system' | 'provider'
  actorId: string
  inputFingerprint: string
  outputFingerprint: string
  parameters: Record<string, unknown>
  providerReference?: string
  occurredAt: ISODateTime
  previousHash?: string
  hash: string
}

export interface ScenarioBranch {
  id: UUID
  sceneId: UUID
  sourceAssetId: UUID
  outputAssetId?: UUID
  title: string
  prompt: string
  transformation: string
  parameters: Record<string, unknown>
  status: JobStatus
  createdBy: UUID
  createdAt: ISODateTime
  completedAt?: ISODateTime
  version: number
}

export interface PipelineJob {
  id: UUID
  sceneId: UUID
  assetId?: UUID
  kind: JobKind
  status: JobStatus
  progress: number
  stage: string
  attempt: number
  maxAttempts: number
  idempotencyKey: string
  payload: Record<string, unknown>
  result?: Record<string, unknown>
  error?: ServiceError
  createdAt: ISODateTime
  startedAt?: ISODateTime
  completedAt?: ISODateTime
  updatedAt: ISODateTime
}

export interface ServiceError {
  code: string
  message: string
  retryable: boolean
  details?: Record<string, unknown>
}

export interface SceneGraphNode {
  id: UUID
  type: 'scene' | 'asset' | 'entity' | 'observation' | 'change' | 'transcript' | 'scenario'
  label: string
  subtitle?: string
  state?: string
  confidence?: number
  data: Record<string, unknown>
}

export interface SceneGraphEdge {
  id: string
  source: UUID
  target: UUID
  type: 'contains' | 'observes' | 'supports' | 'describes' | 'changes' | 'derived_from' | 'mentions' | 'compares'
  weight: number
  data?: Record<string, unknown>
}

export interface SceneGraph {
  sceneId: UUID
  generatedAt: ISODateTime
  version: number
  nodes: SceneGraphNode[]
  edges: SceneGraphEdge[]
}

export interface SearchQuery {
  text: string
  sceneIds?: UUID[]
  lensIds?: LensId[]
  states?: ObservationState[]
  assetKinds?: AssetKind[]
  minConfidence?: number
  capturedAfter?: ISODateTime
  capturedBefore?: ISODateTime
  tags?: string[]
  limit?: number
  cursor?: string
}

export interface SearchHit {
  id: UUID
  type: 'scene' | 'asset' | 'entity' | 'observation' | 'change' | 'transcript_segment'
  sceneId: UUID
  score: number
  title: string
  excerpt: string
  matchedFields: string[]
  evidenceAssetIds: UUID[]
  metadata: Record<string, unknown>
}

export interface SearchResult {
  query: SearchQuery
  hits: SearchHit[]
  total: number
  elapsedMs: number
  nextCursor?: string
  facets: {
    types: Record<string, number>
    states: Record<string, number>
    lenses: Record<string, number>
  }
}

export interface DatabaseShape {
  schemaVersion: number
  revision: number
  workspaces: Workspace[]
  users: User[]
  scenes: Scene[]
  assets: MediaAsset[]
  entities: SceneEntity[]
  observations: Observation[]
  changes: SceneChange[]
  transcripts: Transcript[]
  analyses: AnalysisRun[]
  reviews: ReviewRecord[]
  provenance: ProvenanceEvent[]
  scenarios: ScenarioBranch[]
  jobs: PipelineJob[]
}

export interface Workspace {
  id: UUID
  name: string
  slug: string
  createdAt: ISODateTime
  memberIds: UUID[]
}

export interface User {
  id: UUID
  name: string
  initials: string
  role: 'owner' | 'analyst' | 'reviewer' | 'viewer'
  createdAt: ISODateTime
}

export interface ApiEnvelope<T> {
  data: T
  meta: {
    requestId: string
    timestamp: ISODateTime
    revision?: number
  }
}

export interface ApiFailure {
  error: ServiceError
  meta: {
    requestId: string
    timestamp: ISODateTime
  }
}
