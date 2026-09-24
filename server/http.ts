import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { URL } from 'node:url'
import type { ApiEnvelope, ApiFailure } from '../shared/domain.js'
import { ScenaraApplication } from './app.js'
import { asAppError, AppError } from './lib/errors.js'
import { createId } from './lib/id.js'

type Handler = (context: RequestContext) => Promise<unknown> | unknown

interface RequestContext {
  request: IncomingMessage
  response: ServerResponse
  url: URL
  params: Record<string, string>
  query: URLSearchParams
  requestId: string
  actorId: string
  json<T = unknown>(): Promise<T>
}

interface Route {
  method: string
  pattern: RegExp
  keys: string[]
  handler: Handler
}

function compilePath(path: string): { pattern: RegExp; keys: string[] } {
  const keys: string[] = []
  const parts = path.split('/').map(part => {
    if (part.startsWith(':')) { keys.push(part.slice(1)); return '([^/]+)' }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  })
  return { pattern: new RegExp(`^${parts.join('/')}/?$`), keys }
}

function route(method: string, path: string, handler: Handler): Route {
  const compiled = compilePath(path)
  return { method, ...compiled, handler }
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > 2_000_000) throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'JSON request body exceeds 2 MB')
    chunks.push(buffer)
  }
  if (!chunks.length) return {}
  const source = Buffer.concat(chunks).toString('utf8')
  try { return JSON.parse(source) }
  catch { throw new AppError(400, 'INVALID_JSON', 'Request body must contain valid JSON') }
}

function writeJson(response: ServerResponse, status: number, value: unknown, origin: string): void {
  const body = JSON.stringify(value)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'content-type, x-scenara-user',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'x-content-type-options': 'nosniff',
  })
  response.end(body)
}

export function createHttpServer(app: ScenaraApplication) {
  const routes: Route[] = [
    route('GET', '/api/health', () => app.status()),
    route('GET', '/api/scenes', context => app.listScenes({
      status: context.query.get('status') ?? undefined,
      workspaceId: context.query.get('workspaceId') ?? undefined,
      limit: Number(context.query.get('limit') ?? 100),
    })),
    route('POST', '/api/scenes', async context => app.createScene(await context.json(), context.actorId)),
    route('GET', '/api/scenes/:sceneId', context => app.getScene(context.params.sceneId)),
    route('PATCH', '/api/scenes/:sceneId', async context => app.updateScene(context.params.sceneId, await context.json())),
    route('GET', '/api/scenes/:sceneId/graph', context => app.graph(
      context.params.sceneId,
      context.query.get('rootId') ?? undefined,
      Number(context.query.get('depth') ?? 1),
    )),
    route('POST', '/api/scenes/:sceneId/changes/rebuild', context => app.rebuildChanges(context.params.sceneId)),
    route('GET', '/api/scenes/:sceneId/jobs', context => app.jobsForScene(context.params.sceneId)),
    route('POST', '/api/assets', async context => app.registerAsset(await context.json(), context.actorId)),
    route('GET', '/api/assets/:assetId/provenance', context => app.provenance(context.params.assetId)),
    route('POST', '/api/observations', async context => app.createObservation(await context.json())),
    route('POST', '/api/observations/:observationId/review', async context => app.reviewObservation(context.params.observationId, await context.json(), context.actorId)),
    route('POST', '/api/search', async context => app.search(await context.json())),
    route('GET', '/api/knowledge', () => app.knowledgeMetadata()),
    route('GET', '/api/knowledge/rules', context => app.queryKnowledge(Object.fromEntries(context.query.entries()))),
    route('GET', '/api/knowledge/rules/:ruleId', context => app.knowledgeRule(context.params.ruleId)),
    route('POST', '/api/knowledge/evaluate', async context => app.evaluatePolicy(await context.json())),
    route('POST', '/api/uploads/signature', async context => app.uploadSignature(await context.json())),
    route('POST', '/api/analyze', async context => app.analyzeAsset(await context.json())),
    route('POST', '/api/scenarios', async context => app.createScenario(await context.json(), context.actorId)),
    route('GET', '/api/jobs/:jobId', context => app.getJob(context.params.jobId)),
    route('POST', '/api/jobs/:jobId/cancel', context => app.jobs.cancel(context.params.jobId).then(cancelled => ({ cancelled }))),
  ]

  return createServer(createRequestHandler(app, routes))
}

export function createRequestHandler(app: ScenaraApplication, configuredRoutes?: Route[]) {
  const routes = configuredRoutes ?? [
    route('GET', '/api/health', () => app.status()),
    route('GET', '/api/scenes', context => app.listScenes({
      status: context.query.get('status') ?? undefined,
      workspaceId: context.query.get('workspaceId') ?? undefined,
      limit: Number(context.query.get('limit') ?? 100),
    })),
    route('POST', '/api/scenes', async context => app.createScene(await context.json(), context.actorId)),
    route('GET', '/api/scenes/:sceneId', context => app.getScene(context.params.sceneId)),
    route('PATCH', '/api/scenes/:sceneId', async context => app.updateScene(context.params.sceneId, await context.json())),
    route('GET', '/api/scenes/:sceneId/graph', context => app.graph(
      context.params.sceneId,
      context.query.get('rootId') ?? undefined,
      Number(context.query.get('depth') ?? 1),
    )),
    route('POST', '/api/scenes/:sceneId/changes/rebuild', context => app.rebuildChanges(context.params.sceneId)),
    route('GET', '/api/scenes/:sceneId/jobs', context => app.jobsForScene(context.params.sceneId)),
    route('POST', '/api/assets', async context => app.registerAsset(await context.json(), context.actorId)),
    route('GET', '/api/assets/:assetId/provenance', context => app.provenance(context.params.assetId)),
    route('POST', '/api/observations', async context => app.createObservation(await context.json())),
    route('POST', '/api/observations/:observationId/review', async context => app.reviewObservation(context.params.observationId, await context.json(), context.actorId)),
    route('POST', '/api/search', async context => app.search(await context.json())),
    route('GET', '/api/knowledge', () => app.knowledgeMetadata()),
    route('GET', '/api/knowledge/rules', context => app.queryKnowledge(Object.fromEntries(context.query.entries()))),
    route('GET', '/api/knowledge/rules/:ruleId', context => app.knowledgeRule(context.params.ruleId)),
    route('POST', '/api/knowledge/evaluate', async context => app.evaluatePolicy(await context.json())),
    route('POST', '/api/uploads/signature', async context => app.uploadSignature(await context.json())),
    route('POST', '/api/analyze', async context => app.analyzeAsset(await context.json())),
    route('POST', '/api/scenarios', async context => app.createScenario(await context.json(), context.actorId)),
    route('GET', '/api/jobs/:jobId', context => app.getJob(context.params.jobId)),
    route('POST', '/api/jobs/:jobId/cancel', context => app.jobs.cancel(context.params.jobId).then(cancelled => ({ cancelled }))),
  ]
  return async (request: IncomingMessage, response: ServerResponse) => {
    const requestId = createId('req')
    const origin = app.config.publicOrigin
    if (request.method === 'OPTIONS') { writeJson(response, 204, {}, origin); return }
    try {
      await app.database.refresh()
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`)
      const method = request.method?.toUpperCase() ?? 'GET'
      let selected: Route | undefined
      let match: RegExpExecArray | null = null
      for (const candidate of routes) {
        if (candidate.method !== method) continue
        const candidateMatch = candidate.pattern.exec(url.pathname)
        if (candidateMatch) { selected = candidate; match = candidateMatch; break }
      }
      if (!selected || !match) throw new AppError(404, 'ROUTE_NOT_FOUND', `No route for ${method} ${url.pathname}`)
      const params = Object.fromEntries(selected.keys.map((key, index) => [key, decodeURIComponent(match![index + 1])]))
      const context: RequestContext = {
        request, response, url, params, query: url.searchParams, requestId,
        actorId: String(request.headers['x-scenara-user'] ?? 'user_anshuman'),
        json: () => readJson(request) as Promise<never>,
      }
      const data = await selected.handler(context)
      const envelope: ApiEnvelope<unknown> = { data, meta: { requestId, timestamp: new Date().toISOString(), revision: app.database.revision } }
      writeJson(response, 200, envelope, origin)
    } catch (error) {
      const appError = asAppError(error)
      const failure: ApiFailure = { error: appError.toServiceError(), meta: { requestId, timestamp: new Date().toISOString() } }
      writeJson(response, appError.status, failure, app.config.publicOrigin)
    }
  }
}
