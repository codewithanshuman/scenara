import { createHash } from 'node:crypto'
import type { ServerConfig } from '../config.js'
import type { LensId, MediaAsset } from '../../shared/domain.js'
import { AppError, IntegrationUnavailableError } from '../lib/errors.js'

export interface UploadSignatureRequest {
  sceneId: string
  resourceType: 'image' | 'video' | 'raw'
  filename: string
  eager?: string[]
  context?: Record<string, string>
}

export interface UploadSignatureResponse {
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

export interface AnalyzeRequest {
  asset: MediaAsset
  lensId: LensId
  prompt: string
  async: boolean
}

export interface AnalyzeResponse {
  provider: 'cloudinary_ai_vision'
  status: 'pending' | 'processing' | 'completed' | 'failed'
  taskId?: string
  raw: unknown
  value?: string
}

export interface SearchAssetsRequest {
  expression: string
  maxResults?: number
  nextCursor?: string
  sortBy?: Array<Record<string, 'asc' | 'desc'>>
  withField?: string[]
}

export interface CloudinarySearchResource {
  asset_id: string
  public_id: string
  resource_type: string
  type: string
  format: string
  bytes: number
  width?: number
  height?: number
  duration?: number
  secure_url: string
  created_at: string
  tags?: string[]
  context?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface CloudinarySearchResponse {
  total_count: number
  time: number
  next_cursor?: string
  resources: CloudinarySearchResource[]
}

export type ScenarioTransformation = 'remove' | 'replace' | 'recolor' | 'fill' | 'restore' | 'background_replace'

export interface ScenarioDelivery {
  url: string
  transformation: string
  provider: 'cloudinary' | 'local'
}

function encodeContext(context: Record<string, string> | undefined): string | undefined {
  if (!context) return undefined
  return Object.entries(context)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value.replaceAll('|', '\\|').replaceAll('=', '\\=')}`)
    .join('|')
}

function signatureValue(parameters: Record<string, string | number | undefined>, secret: string): string {
  const source = Object.entries(parameters)
    .filter(([, value]) => value !== undefined && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&')
  return createHash('sha256').update(`${source}${secret}`).digest('hex')
}

function basicAuth(key: string, secret: string): string {
  return `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`
}

function safePublicId(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '').normalize('NFKD')
  return base.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'capture'
}

function promptValue(value: unknown, fallback: string): string {
  const normalized = String(value ?? fallback).trim().slice(0, 500)
  return encodeURIComponent(normalized).replaceAll('%2F', '%252F')
}

export class CloudinaryClient {
  readonly config: ServerConfig['cloudinary']

  constructor(config: ServerConfig['cloudinary']) {
    this.config = config
  }

  get enabled(): boolean {
    return this.config.enabled
  }

  createUploadSignature(input: UploadSignatureRequest): UploadSignatureResponse {
    const timestamp = Math.floor(Date.now() / 1_000)
    const publicId = `${safePublicId(input.filename)}-${timestamp}`
    const folder = `${this.config.uploadFolder}/scenes/${input.sceneId}/originals`

    if (!this.enabled) {
      return {
        mode: 'local',
        timestamp,
        folder,
        publicId,
        message: 'Cloudinary credentials are not configured. The local adapter will preserve metadata only.',
      }
    }

    const eager = input.eager?.join('|')
    const context = encodeContext({
      ...input.context,
      scenara_scene_id: input.sceneId,
      scenara_origin: 'original',
    })
    const parameters = { timestamp, folder, public_id: publicId, eager, context }
    const signature = signatureValue(parameters, this.config.apiSecret!)

    return {
      mode: 'cloudinary',
      endpoint: `https://api.cloudinary.com/v1_1/${this.config.cloudName}/${input.resourceType}/upload`,
      cloudName: this.config.cloudName,
      apiKey: this.config.apiKey,
      timestamp,
      signature,
      folder,
      publicId,
      ...(eager ? { eager } : {}),
      ...(context ? { context } : {}),
    }
  }

  async analyze(input: AnalyzeRequest): Promise<AnalyzeResponse> {
    this.requireEnabled('Cloudinary Analyze API requires configured credentials')
    const source = input.asset.cloudinary?.assetId
      ? { asset_id: input.asset.cloudinary.assetId }
      : input.asset.cloudinary?.secureUrl || input.asset.localUrl
        ? { uri: input.asset.cloudinary?.secureUrl ?? input.asset.localUrl }
        : undefined
    if (!source) {
      throw new AppError(422, 'ASSET_SOURCE_MISSING', 'The asset has no analyzable Cloudinary identity or URL')
    }

    const endpoint = `https://api.cloudinary.com/v2/analysis/${this.config.cloudName}/analyze/ai_vision_general`
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: basicAuth(this.config.apiKey!, this.config.apiSecret!),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        source,
        prompts: [input.prompt],
        async: input.async,
        ...(input.async && this.config.notificationUrl ? { notification_url: this.config.notificationUrl } : {}),
      }),
    })
    const raw = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new AppError(response.status, 'CLOUDINARY_ANALYZE_FAILED', 'Cloudinary Analyze API rejected the request', {
        retryable: response.status >= 500 || response.status === 429,
        details: { response: raw },
      })
    }
    const record = raw as Record<string, unknown>
    const data = Array.isArray(record.data) ? record.data[0] as Record<string, unknown> | undefined : undefined
    return {
      provider: 'cloudinary_ai_vision',
      status: response.status === 202 ? 'pending' : 'completed',
      taskId: String(record.task_id ?? record.taskId ?? '') || undefined,
      raw,
      value: typeof data?.value === 'string' ? data.value : typeof record.value === 'string' ? record.value : undefined,
    }
  }

  async analysisTask(taskId: string): Promise<AnalyzeResponse> {
    this.requireEnabled('Cloudinary Analyze API requires configured credentials')
    const endpoint = `https://api.cloudinary.com/v2/analysis/${this.config.cloudName}/tasks/${encodeURIComponent(taskId)}`
    const response = await fetch(endpoint, {
      headers: { authorization: basicAuth(this.config.apiKey!, this.config.apiSecret!) },
    })
    const raw = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new AppError(response.status, 'CLOUDINARY_TASK_FAILED', 'Unable to read the Cloudinary analysis task', {
        retryable: response.status >= 500 || response.status === 429,
        details: { response: raw },
      })
    }
    const record = raw as Record<string, unknown>
    const status = String(record.status ?? 'processing') as AnalyzeResponse['status']
    return {
      provider: 'cloudinary_ai_vision',
      status,
      taskId,
      raw,
      value: typeof record.value === 'string' ? record.value : undefined,
    }
  }

  async search(input: SearchAssetsRequest): Promise<CloudinarySearchResponse> {
    this.requireEnabled('Cloudinary Search API requires configured credentials')
    const endpoint = `https://api.cloudinary.com/v1_1/${this.config.cloudName}/resources/search`
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: basicAuth(this.config.apiKey!, this.config.apiSecret!),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        expression: input.expression,
        max_results: input.maxResults ?? 100,
        ...(input.nextCursor ? { next_cursor: input.nextCursor } : {}),
        ...(input.sortBy ? { sort_by: input.sortBy } : {}),
        ...(input.withField ? { with_field: input.withField } : {}),
      }),
    })
    const raw = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new AppError(response.status, 'CLOUDINARY_SEARCH_FAILED', 'Cloudinary Search API rejected the query', {
        retryable: response.status >= 500 || response.status === 429,
        details: { response: raw },
      })
    }
    return raw as CloudinarySearchResponse
  }

  buildDeliveryUrl(
    asset: MediaAsset,
    transformations: string[],
    options: { format?: string; quality?: string } = {},
  ): string {
    if (!asset.cloudinary) return asset.localUrl ?? ''
    const cloud = this.config.cloudName
    const steps = [...transformations]
    if (options.quality) steps.push(`q_${options.quality}`)
    if (options.format) steps.push(`f_${options.format}`)
    const transformation = steps.filter(Boolean).join('/')
    const version = `v${asset.cloudinary.version}`
    const extension = options.format === 'auto' ? asset.cloudinary.format : options.format ?? asset.cloudinary.format
    return `https://res.cloudinary.com/${cloud}/${asset.cloudinary.resourceType}/upload/${transformation}/${version}/${asset.cloudinary.publicId}.${extension}`
  }

  buildScenarioDelivery(
    asset: MediaAsset,
    transformation: ScenarioTransformation,
    prompt: string,
    parameters: Record<string, unknown>,
  ): ScenarioDelivery {
    if (!asset.cloudinary || !this.enabled) {
      return { url: asset.localUrl ?? asset.cloudinary?.secureUrl ?? '', transformation: 'local_identity_preview', provider: 'local' }
    }
    if (asset.kind !== 'image') {
      throw new AppError(422, 'SCENARIO_MEDIA_UNSUPPORTED', 'Generative scenario transformations currently require an image source')
    }
    const target = promptValue(parameters.target, prompt)
    const replacement = promptValue(parameters.replacement, prompt)
    const color = promptValue(parameters.color, 'fresh white')
    const steps: string[] = []
    switch (transformation) {
      case 'remove':
        steps.push(`e_gen_remove:prompt_${target};remove-shadow_true`)
        break
      case 'replace':
        steps.push(`e_gen_replace:from_${target};to_${replacement};preserve-geometry_true`)
        break
      case 'recolor':
        steps.push(`e_gen_recolor:prompt_(${target});to-color_${color};multiple_true`)
        break
      case 'fill': {
        const aspectRatio = String(parameters.aspectRatio ?? '16:9').replace(/[^0-9:.]/g, '') || '16:9'
        steps.push(`ar_${aspectRatio},c_pad,b_gen_fill:prompt_${promptValue(parameters.fillPrompt, prompt)}`)
        break
      }
      case 'restore':
        steps.push('e_gen_restore')
        break
      case 'background_replace':
        steps.push(`e_gen_background_replace:prompt_${promptValue(parameters.background, prompt)}`)
        break
    }
    steps.push('co_white,b_rgb:11182799,l_text:Arial_32_bold:SIMULATED')
    steps.push('fl_layer_apply,g_south_east,x_24,y_24')
    const url = this.buildDeliveryUrl(asset, steps, { format: 'auto', quality: 'auto:good' })
    return { url, transformation: steps.join('/'), provider: 'cloudinary' }
  }

  private requireEnabled(message: string): void {
    if (!this.enabled) throw new IntegrationUnavailableError('cloudinary', message)
  }
}
