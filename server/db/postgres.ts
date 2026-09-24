import postgres, { type Sql } from 'postgres'
import type { DatabaseShape } from '../../shared/domain.js'
import { ConflictError } from '../lib/errors.js'
import {
  emptyDatabase,
  type DatabaseMutation,
  type DatabaseStore,
} from './store.js'

function clone<T>(value: T): T {
  return structuredClone(value)
}

/**
 * ACID state store for serverless deployments.
 *
 * Scenara's domain model is an event-rich aggregate. Keeping the complete
 * aggregate in one JSONB row lets every cross-collection mutation commit as a
 * single transaction while preserving the exact same domain invariants as the
 * local JSON adapter. SELECT ... FOR UPDATE serializes concurrent writers and
 * the revision column provides optimistic concurrency for API clients.
 */
export class PostgresDatabase implements DatabaseStore {
  readonly kind = 'postgres' as const
  readonly #sql: Sql
  #state: DatabaseShape = emptyDatabase()
  #initialized = false

  constructor(connectionString: string) {
    this.#sql = postgres(connectionString, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 15,
      prepare: false,
    })
  }

  get revision(): number {
    return this.#state.revision
  }

  async initialize(seed?: DatabaseShape): Promise<void> {
    if (this.#initialized) return
    await this.#sql`
      create table if not exists scenara_state (
        id text primary key,
        revision bigint not null,
        state jsonb not null,
        updated_at timestamptz not null default now()
      )
    `
    const initial = clone(seed ?? emptyDatabase())
    await this.#sql`
      insert into scenara_state (id, revision, state)
      values ('primary', ${initial.revision}, ${this.#sql.json(initial as never)})
      on conflict (id) do nothing
    `
    this.#initialized = true
    await this.refresh()
  }

  async refresh(): Promise<void> {
    this.ensureInitialized()
    const rows = await this.#sql<{ state: DatabaseShape; revision: string }[]>`
      select state, revision from scenara_state where id = 'primary'
    `
    if (!rows[0]) throw new Error('Scenara database state is missing')
    this.#state = clone(rows[0].state)
    this.#state.revision = Number(rows[0].revision)
    this.assertShape(this.#state)
  }

  snapshot(): DatabaseShape {
    this.ensureInitialized()
    return clone(this.#state)
  }

  async transaction<T>(mutation: DatabaseMutation<T>, expectedRevision?: number): Promise<T> {
    this.ensureInitialized()
    let committed!: DatabaseShape
    const result = await this.#sql.begin(async sql => {
      const rows = await sql<{ state: DatabaseShape; revision: string }[]>`
        select state, revision from scenara_state where id = 'primary' for update
      `
      if (!rows[0]) throw new Error('Scenara database state is missing')
      const current = clone(rows[0].state)
      current.revision = Number(rows[0].revision)
      this.assertShape(current)
      if (expectedRevision !== undefined && current.revision !== expectedRevision) {
        throw new ConflictError('Database revision changed before the mutation could commit', {
          expectedRevision,
          actualRevision: current.revision,
        })
      }
      const draft = clone(current)
      const value = await mutation(draft, {
        baseRevision: current.revision,
        startedAt: new Date().toISOString(),
      })
      draft.revision = current.revision + 1
      await sql`
        update scenara_state
        set revision = ${draft.revision}, state = ${sql.json(draft as never)}, updated_at = now()
        where id = 'primary'
      `
      committed = draft
      return value
    })
    this.#state = committed
    return result as unknown as T
  }

  async replace(next: DatabaseShape, expectedRevision?: number): Promise<void> {
    this.assertShape(next)
    await this.transaction(draft => {
      for (const key of Object.keys(draft) as Array<keyof DatabaseShape>) {
        ;(draft[key] as unknown) = clone(next[key])
      }
    }, expectedRevision)
  }

  async close(): Promise<void> {
    await this.#sql.end({ timeout: 2 })
  }

  private ensureInitialized(): void {
    if (!this.#initialized) throw new Error('Database must be initialized before use')
  }

  private assertShape(value: DatabaseShape): void {
    if (!value || typeof value !== 'object') throw new Error('Database state is not an object')
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
