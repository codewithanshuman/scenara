import type { PipelineJob, ServiceError } from '../../shared/domain.js'
import type { DatabaseStore } from '../db/store.js'
import { asAppError } from '../lib/errors.js'
import { createId, now } from '../lib/id.js'

export interface JobContext<TPayload extends Record<string, unknown>> {
  job: PipelineJob
  payload: TPayload
  progress(value: number, stage: string, result?: Record<string, unknown>): Promise<void>
  isCancelled(): boolean
}

export type JobHandler<TPayload extends Record<string, unknown> = Record<string, unknown>> =
  (context: JobContext<TPayload>) => Promise<Record<string, unknown> | void>

interface QueuedWork {
  id: string
  handler: JobHandler
}

export class DurableJobQueue {
  readonly database: DatabaseStore
  readonly concurrency: number
  readonly executionMode: 'background' | 'inline'
  #pending: QueuedWork[] = []
  #running = new Set<string>()
  #cancelled = new Set<string>()

  constructor(database: DatabaseStore, concurrency = 2, executionMode: 'background' | 'inline' = 'background') {
    this.database = database
    this.concurrency = Math.max(1, concurrency)
    this.executionMode = executionMode
  }

  async enqueue(
    input: Omit<PipelineJob, 'id' | 'status' | 'progress' | 'stage' | 'attempt' | 'createdAt' | 'updatedAt'>,
    handler: JobHandler,
  ): Promise<PipelineJob> {
    const existing = this.database.snapshot().jobs.find(job =>
      job.idempotencyKey === input.idempotencyKey && ['queued', 'running', 'succeeded'].includes(job.status),
    )
    if (existing) return existing
    const timestamp = now()
    const job: PipelineJob = {
      ...input,
      id: createId('job'),
      status: 'queued',
      progress: 0,
      stage: 'Queued',
      attempt: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    await this.database.transaction(draft => { draft.jobs.push(job) })
    const work = { id: job.id, handler }
    if (this.executionMode === 'inline') {
      await this.execute(work)
      return this.database.snapshot().jobs.find(item => item.id === job.id) ?? job
    }
    this.#pending.push(work)
    queueMicrotask(() => void this.drain())
    return job
  }

  async cancel(jobId: string): Promise<boolean> {
    const job = this.database.snapshot().jobs.find(item => item.id === jobId)
    if (!job || ['succeeded', 'failed', 'cancelled'].includes(job.status)) return false
    this.#cancelled.add(jobId)
    this.#pending = this.#pending.filter(item => item.id !== jobId)
    await this.update(jobId, { status: 'cancelled', stage: 'Cancelled', completedAt: now() })
    return true
  }

  async retry(jobId: string, handler: JobHandler): Promise<PipelineJob | undefined> {
    const job = this.database.snapshot().jobs.find(item => item.id === jobId)
    if (!job || !['failed', 'cancelled'].includes(job.status) || job.attempt >= job.maxAttempts) return undefined
    this.#cancelled.delete(jobId)
    await this.update(jobId, { status: 'queued', progress: 0, stage: 'Queued for retry', error: undefined, completedAt: undefined })
    this.#pending.push({ id: jobId, handler })
    queueMicrotask(() => void this.drain())
    return this.database.snapshot().jobs.find(item => item.id === jobId)
  }

  private async drain(): Promise<void> {
    while (this.#running.size < this.concurrency && this.#pending.length) {
      const work = this.#pending.shift()!
      if (this.#cancelled.has(work.id)) continue
      this.#running.add(work.id)
      void this.execute(work).finally(() => {
        this.#running.delete(work.id)
        queueMicrotask(() => void this.drain())
      })
    }
  }

  private async execute(work: QueuedWork): Promise<void> {
    let job = this.database.snapshot().jobs.find(item => item.id === work.id)
    if (!job) return
    await this.update(work.id, { status: 'running', stage: 'Starting', startedAt: now(), attempt: job.attempt + 1 })
    job = this.database.snapshot().jobs.find(item => item.id === work.id)!
    try {
      const result = await work.handler({
        job,
        payload: job.payload,
        progress: async (value, stage, partial) => {
          if (this.#cancelled.has(work.id)) return
          await this.update(work.id, { progress: Math.max(0, Math.min(100, value)), stage, ...(partial ? { result: partial } : {}) })
        },
        isCancelled: () => this.#cancelled.has(work.id),
      })
      if (this.#cancelled.has(work.id)) return
      await this.update(work.id, {
        status: 'succeeded', progress: 100, stage: 'Complete', completedAt: now(),
        ...(result ? { result } : {}),
      })
    } catch (error) {
      const appError = asAppError(error)
      const serviceError: ServiceError = appError.toServiceError()
      await this.update(work.id, { status: 'failed', stage: 'Failed', completedAt: now(), error: serviceError })
    }
  }

  private async update(jobId: string, patch: Partial<PipelineJob>): Promise<void> {
    await this.database.transaction(draft => {
      const index = draft.jobs.findIndex(job => job.id === jobId)
      if (index < 0) return
      draft.jobs[index] = { ...draft.jobs[index], ...patch, updatedAt: now() }
    })
  }
}
