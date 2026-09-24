import type { IncomingMessage, ServerResponse } from 'node:http'
import { URL } from 'node:url'
import { ScenaraApplication } from '../server/app.js'
import { loadConfig } from '../server/config.js'
import { PostgresDatabase } from '../server/db/postgres.js'
import { createRequestHandler } from '../server/http.js'
import { seedDatabase } from '../server/seed.js'

let handlerPromise: Promise<(request: IncomingMessage, response: ServerResponse) => Promise<void>> | undefined

async function buildHandler() {
  const config = loadConfig()
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required for the Vercel deployment. Connect a Neon Postgres integration to this project.')
  }
  const database = new PostgresDatabase(config.databaseUrl)
  await database.initialize(seedDatabase())
  return createRequestHandler(new ScenaraApplication({ ...config, serverless: true }, database))
}

function restoreApiPath(request: IncomingMessage): void {
  const url = new URL(request.url ?? '/api', `http://${request.headers.host ?? '127.0.0.1'}`)
  const path = url.searchParams.get('__scenara_path')
  if (path === null) return
  url.searchParams.delete('__scenara_path')
  const suffix = url.searchParams.toString()
  request.url = `/api/${path}${suffix ? `?${suffix}` : ''}`
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  handlerPromise ??= buildHandler()
  try {
    restoreApiPath(request)
    const requestHandler = await handlerPromise
    return await requestHandler(request, response)
  } catch (error) {
    handlerPromise = undefined
    const message = error instanceof Error ? error.message : 'Unable to initialize Scenara API'
    response.statusCode = 503
    response.setHeader('content-type', 'application/json; charset=utf-8')
    response.setHeader('cache-control', 'no-store')
    response.end(JSON.stringify({
      error: { code: 'DATABASE_UNAVAILABLE', message, retryable: true },
      meta: { requestId: 'initialization', timestamp: new Date().toISOString() },
    }))
  }
}
