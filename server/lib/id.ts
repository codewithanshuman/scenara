import { createHash, randomUUID } from 'node:crypto'

export function createId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '')}`
}

export function stableId(prefix: string, ...parts: Array<string | number | boolean | null | undefined>): string {
  const value = parts.map(part => String(part ?? '')).join('\u001f')
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 24)}`
}

export function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

export function now(): string {
  return new Date().toISOString()
}
