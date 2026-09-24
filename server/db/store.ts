import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { DatabaseShape } from '../../shared/domain.js'
import { ConflictError } from '../lib/errors.js'

export interface TransactionContext {
  readonly baseRevision: number
  readonly startedAt: string
}

export type DatabaseMutation<T> = (draft: DatabaseShape, context: TransactionContext) => T | Promise<T>

export interface DatabaseStore {
  readonly kind: 'json' | 'postgres'
  readonly revision: number
  initialize(seed?: DatabaseShape): Promise<void>
  refresh(): Promise<void>
  snapshot(): DatabaseShape
  transaction<T>(mutation: DatabaseMutation<T>, expectedRevision?: number): Promise<T>
  replace(next: DatabaseShape, expectedRevision?: number): Promise<void>
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

export function emptyDatabase(): DatabaseShape {
  return {
    schemaVersion: 1,
    revision: 0,
    workspaces: [],
    users: [],
    scenes: [],
    assets: [],
    entities: [],
    observations: [],
    changes: [],
    transcripts: [],
    analyses: [],
    reviews: [],
    provenance: [],
    scenarios: [],
    jobs: [],
  }
}

export class JsonDatabase {
  readonly kind = 'json' as const
  readonly filePath: string
  #state: DatabaseShape = emptyDatabase()
  #writeQueue: Promise<void> = Promise.resolve()
  #initialized = false

  constructor(filePath: string) {
    this.filePath = filePath
  }

  async initialize(seed?: DatabaseShape): Promise<void> {
    if (this.#initialized) return
    await mkdir(path.dirname(this.filePath), { recursive: true })
    try {
      const source = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(source) as DatabaseShape
      this.assertShape(parsed)
      this.#state = parsed
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') throw error
      this.#state = seed ? clone(seed) : emptyDatabase()
      await this.persist(this.#state)
    }
    this.#initialized = true
  }

  async refresh(): Promise<void> {
    this.ensureInitialized()
  }

  snapshot(): DatabaseShape {
    this.ensureInitialized()
    return clone(this.#state)
  }

  get revision(): number {
    return this.#state.revision
  }

  async transaction<T>(mutation: DatabaseMutation<T>, expectedRevision?: number): Promise<T> {
    this.ensureInitialized()
    let result!: T
    let failure: unknown

    this.#writeQueue = this.#writeQueue.then(async () => {
      try {
        const current = this.#state
        if (expectedRevision !== undefined && current.revision !== expectedRevision) {
          throw new ConflictError('Database revision changed before the mutation could commit', {
            expectedRevision,
            actualRevision: current.revision,
          })
        }

        const draft = clone(current)
        result = await mutation(draft, {
          baseRevision: current.revision,
          startedAt: new Date().toISOString(),
        })
        draft.revision = current.revision + 1
        await this.persist(draft)
        this.#state = draft
      } catch (error) {
        failure = error
      }
    })

    await this.#writeQueue
    if (failure) throw failure
    return result
  }

  async replace(next: DatabaseShape, expectedRevision?: number): Promise<void> {
    this.assertShape(next)
    await this.transaction(draft => {
      for (const key of Object.keys(draft) as Array<keyof DatabaseShape>) {
        // The caller supplied a complete validated database snapshot.
        ;(draft[key] as unknown) = clone(next[key])
      }
    }, expectedRevision)
  }

  private async persist(state: DatabaseShape): Promise<void> {
    const temporary = `${this.filePath}.${process.pid}.${Date.now()}.tmp`
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    await rename(temporary, this.filePath)
  }

  private ensureInitialized(): void {
    if (!this.#initialized) throw new Error('Database must be initialized before use')
  }

  private assertShape(value: DatabaseShape): void {
    if (!value || typeof value !== 'object') throw new Error('Database file is not an object')
    if (value.schemaVersion !== 1) throw new Error(`Unsupported database schema version: ${value.schemaVersion}`)
    const arrays: Array<keyof DatabaseShape> = [
      'workspaces', 'users', 'scenes', 'assets', 'entities', 'observations', 'changes',
      'transcripts', 'analyses', 'reviews', 'provenance', 'scenarios', 'jobs',
    ]
    for (const key of arrays) {
      if (!Array.isArray(value[key])) throw new Error(`Database collection '${key}' is invalid`)
    }
  }
}
