export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortValue(nested)]),
    )
  }
  if (typeof value === 'number' && Object.is(value, -0)) return 0
  return value
}

export function encodeCursor(value: Record<string, unknown>): string {
  return Buffer.from(canonicalize(value)).toString('base64url')
}

export function decodeCursor<T extends Record<string, unknown>>(value: string | undefined): T | undefined {
  if (!value) return undefined
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T
  } catch {
    return undefined
  }
}
