import type {
  AnalysisRun, ApiEnvelope, ApiFailure, MediaAsset, Observation, PipelineJob,
  ProvenanceEvent, ReviewRecord, ScenarioBranch, Scene, SceneChange, SceneEntity,
  SceneGraph, SearchQuery, SearchResult, Transcript,
} from '../../shared/domain'

export interface SceneSummary extends Scene {
  assetCount: number
  entityCount: number
  observationCount: number
  changeCount: number
  reviewCount: number
  coverUrl?: string
}

export interface SceneWorkspace extends Scene {
  assets: MediaAsset[]
  entities: SceneEntity[]
  observations: Observation[]
  changes: SceneChange[]
  transcripts: Transcript[]
  scenarios: ScenarioBranch[]
  jobs: PipelineJob[]
  reviewCount: number
}

export interface HealthStatus {
  status: 'ok'
  mode: 'cloudinary' | 'local-adapter'
  revision: number
  counts: {
    scenes: number
    assets: number
    entities: number
    observations: number
    changes: number
    reviewQueue: number
    activeJobs: number
  }
}

export interface ProvenanceResponse {
  asset: MediaAsset
  events: ProvenanceEvent[]
  verification: { valid: boolean; checked: number; brokenEventId?: string; reason?: string }
}

export interface ReviewInput {
  decision: 'verified' | 'corrected' | 'dismissed' | 'deferred'
  expectedVersion: number
  rationale?: string
  correction?: Partial<Pick<Observation, 'label' | 'description' | 'condition' | 'severity' | 'attributes'>>
}

export interface UploadSignatureInput {
  sceneId: string
  resourceType: 'image' | 'video' | 'raw'
  filename: string
  eager?: string[]
  context?: Record<string, string>
}

export interface UploadSignature {
  mode: 'cloudinary' | 'local'
  endpoint?: string
  cloudName?: string
  apiKey?: string
  timestamp: number
  signature?: string
  folder: string
  publicId: string
  eager?: string
  context?: string
  message?: string
}

export interface AnalyzeAssetInput {
  assetId: string
  lensId: Observation['lensId']
  force?: boolean
  async?: boolean
}

export interface ScenarioInput {
  sceneId: string
  sourceAssetId: string
  title: string
  prompt: string
  transformation: 'remove' | 'replace' | 'recolor' | 'fill' | 'restore' | 'background_replace'
  parameters?: Record<string, unknown>
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly retryable: boolean
  readonly details?: Record<string, unknown>
  readonly requestId?: string

  constructor(status: number, failure: ApiFailure) {
    super(failure.error.message)
    this.name = 'ApiError'
    this.status = status
    this.code = failure.error.code
    this.retryable = failure.error.retryable
    this.details = failure.error.details
    this.requestId = failure.meta.requestId
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  signal?: AbortSignal
}

export class ScenaraApi {
  readonly baseUrl: string
  readonly actorId: string

  constructor(baseUrl = '/api', actorId = 'user_anshuman') {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.actorId = actorId
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<ApiEnvelope<T>> {
    const { body, ...requestOptions } = options
    const headers = new Headers(options.headers)
    headers.set('accept', 'application/json')
    headers.set('x-scenara-user', this.actorId)
    const init: RequestInit = { ...requestOptions, headers }
    if (body !== undefined) {
      headers.set('content-type', 'application/json')
      init.body = JSON.stringify(body)
    }
    const response = await fetch(`${this.baseUrl}${path}`, init)
    const payload = await response.json().catch(() => ({
      error: { code: 'INVALID_RESPONSE', message: 'The server returned an unreadable response', retryable: response.status >= 500 },
      meta: { requestId: '', timestamp: new Date().toISOString() },
    }))
    if (!response.ok) throw new ApiError(response.status, payload as ApiFailure)
    return payload as ApiEnvelope<T>
  }

  async health(signal?: AbortSignal): Promise<HealthStatus> {
    return (await this.request<HealthStatus>('/health', { signal })).data
  }

  async scenes(options: { status?: Scene['status']; workspaceId?: string; limit?: number; signal?: AbortSignal } = {}): Promise<SceneSummary[]> {
    const query = new URLSearchParams()
    if (options.status) query.set('status', options.status)
    if (options.workspaceId) query.set('workspaceId', options.workspaceId)
    if (options.limit) query.set('limit', String(options.limit))
    return (await this.request<SceneSummary[]>(`/scenes${query.size ? `?${query}` : ''}`, { signal: options.signal })).data
  }

  async scene(sceneId: string, signal?: AbortSignal): Promise<SceneWorkspace> {
    return (await this.request<SceneWorkspace>(`/scenes/${encodeURIComponent(sceneId)}`, { signal })).data
  }

  async graph(sceneId: string, options: { rootId?: string; depth?: number; signal?: AbortSignal } = {}): Promise<SceneGraph> {
    const query = new URLSearchParams()
    if (options.rootId) query.set('rootId', options.rootId)
    if (options.depth !== undefined) query.set('depth', String(options.depth))
    return (await this.request<SceneGraph>(`/scenes/${encodeURIComponent(sceneId)}/graph${query.size ? `?${query}` : ''}`, { signal: options.signal })).data
  }

  async search(query: SearchQuery, signal?: AbortSignal): Promise<SearchResult> {
    return (await this.request<SearchResult>('/search', { method: 'POST', body: query, signal })).data
  }

  async review(observationId: string, input: ReviewInput): Promise<{ observation: Observation; review: ReviewRecord }> {
    return (await this.request<{ observation: Observation; review: ReviewRecord }>(
      `/observations/${encodeURIComponent(observationId)}/review`,
      { method: 'POST', body: input },
    )).data
  }

  async provenance(assetId: string, signal?: AbortSignal): Promise<ProvenanceResponse> {
    return (await this.request<ProvenanceResponse>(`/assets/${encodeURIComponent(assetId)}/provenance`, { signal })).data
  }

  async signature(input: UploadSignatureInput): Promise<UploadSignature> {
    return (await this.request<UploadSignature>('/uploads/signature', { method: 'POST', body: input })).data
  }

  async analyze(input: AnalyzeAssetInput): Promise<{ analysis: AnalysisRun; job: PipelineJob }> {
    return (await this.request<{ analysis: AnalysisRun; job: PipelineJob }>('/analyze', {
      method: 'POST',
      body: { ...input, force: input.force ?? false, async: input.async ?? true },
    })).data
  }

  async createScenario(input: ScenarioInput): Promise<{ scenario: ScenarioBranch; jobId: string }> {
    return (await this.request<{ scenario: ScenarioBranch; jobId: string }>('/scenarios', {
      method: 'POST', body: { ...input, parameters: input.parameters ?? {} },
    })).data
  }

  async jobs(sceneId: string, signal?: AbortSignal): Promise<PipelineJob[]> {
    return (await this.request<PipelineJob[]>(`/scenes/${encodeURIComponent(sceneId)}/jobs`, { signal })).data
  }

  async job(jobId: string, signal?: AbortSignal): Promise<PipelineJob> {
    return (await this.request<PipelineJob>(`/jobs/${encodeURIComponent(jobId)}`, { signal })).data
  }

  async cancelJob(jobId: string): Promise<boolean> {
    return (await this.request<{ cancelled: boolean }>(`/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' })).data.cancelled
  }
}

export const api = new ScenaraApi()
