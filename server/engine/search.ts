import type {
  DatabaseShape, SearchHit, SearchQuery, SearchResult,
} from '../../shared/domain.js'
import { decodeCursor, encodeCursor } from './serialization.js'

interface SearchDocument {
  id: string
  sceneId: string
  type: SearchHit['type']
  title: string
  body: string
  fields: Record<string, string>
  evidenceAssetIds: string[]
  capturedAt?: string
  confidence?: number
  lensId?: string
  state?: string
  assetKind?: string
  tags: string[]
  metadata: Record<string, unknown>
}

interface ParsedQuery {
  terms: string[]
  phrases: string[]
  excluded: string[]
  fieldTerms: Array<{ field: string; value: string }>
  semanticIntents: string[]
}

const synonyms: Record<string, string[]> = {
  change: ['changed', 'difference', 'modified', 'appeared', 'disappeared', 'moved'],
  damage: ['damaged', 'broken', 'cracked', 'degraded', 'defect'],
  road: ['street', 'carriageway', 'lane', 'asphalt'],
  obstruction: ['blocked', 'barrier', 'obstacle', 'occluded'],
  access: ['accessible', 'accessibility', 'ramp', 'curb', 'entrance'],
  plant: ['vegetation', 'tree', 'canopy', 'garden', 'foliage'],
  water: ['drainage', 'standing water', 'flood', 'ponding'],
  risk: ['hazard', 'unsafe', 'critical', 'warning'],
  proof: ['evidence', 'source', 'supporting', 'original'],
  video: ['walkthrough', 'recording', 'clip', 'frame'],
}

const stopWords = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have',
  'in', 'is', 'it', 'near', 'of', 'on', 'or', 'show', 'that', 'the', 'this', 'to',
  'was', 'were', 'what', 'where', 'which', 'with',
])

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9\s:_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(value: string): string[] {
  return normalize(value).split(' ').filter(token => token && !stopWords.has(token))
}

function parseQuery(value: string): ParsedQuery {
  const phrases = [...value.matchAll(/"([^"]+)"/g)].map(match => normalize(match[1]))
  const withoutPhrases = value.replace(/"[^"]+"/g, ' ')
  const terms: string[] = []
  const excluded: string[] = []
  const fieldTerms: ParsedQuery['fieldTerms'] = []
  for (const raw of tokenize(withoutPhrases)) {
    if (raw.startsWith('-') && raw.length > 1) excluded.push(raw.slice(1))
    else if (raw.includes(':')) {
      const [field, ...rest] = raw.split(':')
      fieldTerms.push({ field, value: rest.join(':') })
    } else terms.push(raw)
  }
  const semanticIntents: string[] = []
  const source = normalize(value)
  if (/\b(change|changed|difference|since|before|after)\b/.test(source)) semanticIntents.push('temporal_change')
  if (/\b(review|verify|uncertain|confidence)\b/.test(source)) semanticIntents.push('review')
  if (/\b(video|walkthrough|transcript|said|audio)\b/.test(source)) semanticIntents.push('media_moment')
  if (/\b(proof|evidence|source|original)\b/.test(source)) semanticIntents.push('evidence')
  return { terms, phrases, excluded, fieldTerms, semanticIntents }
}

function expandTerm(term: string): Set<string> {
  const result = new Set([term])
  for (const [key, values] of Object.entries(synonyms)) {
    if (term === key || values.includes(term)) {
      result.add(key)
      for (const value of values) result.add(value)
    }
  }
  return result
}

function documents(database: DatabaseShape): SearchDocument[] {
  const result: SearchDocument[] = []
  for (const scene of database.scenes) {
    result.push({
      id: scene.id, sceneId: scene.id, type: 'scene', title: scene.title,
      body: `${scene.description} ${scene.locationLabel}`,
      fields: { status: scene.status, location: scene.locationLabel }, evidenceAssetIds: [],
      capturedAt: scene.captureEnd, tags: scene.tags,
      metadata: { status: scene.status, locationLabel: scene.locationLabel, assetCount: scene.assetIds.length },
    })
  }
  for (const asset of database.assets) {
    result.push({
      id: asset.id, sceneId: asset.sceneId, type: 'asset', title: asset.sourceFilename,
      body: `${asset.sourceFilename} ${asset.tags.join(' ')} ${Object.values(asset.structuredMetadata).flat().join(' ')}`,
      fields: { kind: asset.kind, origin: asset.origin, mime: asset.mimeType },
      evidenceAssetIds: [asset.id], capturedAt: asset.capturedAt, assetKind: asset.kind, tags: asset.tags,
      metadata: { kind: asset.kind, origin: asset.origin, url: asset.cloudinary?.secureUrl ?? asset.localUrl, dimensions: asset.dimensions },
    })
  }
  for (const entity of database.entities) {
    result.push({
      id: entity.id, sceneId: entity.sceneId, type: 'entity', title: entity.displayName,
      body: `${entity.canonicalLabel} ${entity.aliases.join(' ')} ${Object.values(entity.stableAttributes).flat().join(' ')}`,
      fields: { canonical: entity.canonicalLabel }, evidenceAssetIds: entity.assetIds,
      capturedAt: entity.lastObservedAt, tags: [], metadata: { aliases: entity.aliases, centroid: entity.centroid, observationCount: entity.observationIds.length },
    })
  }
  for (const observation of database.observations) {
    result.push({
      id: observation.id, sceneId: observation.sceneId, type: 'observation', title: observation.label,
      body: `${observation.canonicalLabel} ${observation.description} ${observation.condition ?? ''} ${observation.severity ?? ''} ${Object.values(observation.attributes).flat().join(' ')}`,
      fields: { state: observation.state, lens: observation.lensId, severity: observation.severity ?? '', condition: observation.condition ?? '' },
      evidenceAssetIds: observation.evidence.map(item => item.assetId), capturedAt: observation.capturedAt,
      confidence: observation.confidence, lensId: observation.lensId, state: observation.state, tags: [],
      metadata: { state: observation.state, lensId: observation.lensId, confidence: observation.confidence, severity: observation.severity, condition: observation.condition, requiresReview: observation.requiresReview, attributes: observation.attributes },
    })
  }
  for (const change of database.changes) {
    result.push({
      id: change.id, sceneId: change.sceneId, type: 'change', title: change.title,
      body: `${change.description} ${change.kind} ${change.significance}`,
      fields: { kind: change.kind, significance: change.significance }, evidenceAssetIds: change.evidenceAssetIds,
      capturedAt: change.lastSeenAt, confidence: change.confidence, state: change.requiresReview ? 'review' : 'verified', tags: [],
      metadata: { state: change.requiresReview ? 'review' : 'verified', confidence: change.confidence, kind: change.kind, significance: change.significance, firstSeenAt: change.firstSeenAt, lastSeenAt: change.lastSeenAt },
    })
  }
  for (const transcript of database.transcripts) {
    const asset = database.assets.find(item => item.id === transcript.assetId)
    if (!asset) continue
    for (const segment of transcript.segments) {
      result.push({
        id: segment.id, sceneId: asset.sceneId, type: 'transcript_segment',
        title: `${asset.sourceFilename} · ${formatTime(segment.startSeconds)}`,
        body: segment.text, fields: { language: transcript.language, speaker: segment.speaker ?? '' },
        evidenceAssetIds: [asset.id], capturedAt: asset.capturedAt, assetKind: asset.kind, tags: asset.tags,
        metadata: { assetId: asset.id, transcriptId: transcript.id, startSeconds: segment.startSeconds, endSeconds: segment.endSeconds, linkedObservationIds: segment.linkedObservationIds },
      })
    }
  }
  return result
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

function scoreDocument(document: SearchDocument, parsed: ParsedQuery): { score: number; fields: string[] } | undefined {
  const title = normalize(document.title)
  const body = normalize(document.body)
  const tags = normalize(document.tags.join(' '))
  const complete = `${title} ${body} ${tags} ${normalize(Object.values(document.fields).join(' '))}`
  for (const excluded of parsed.excluded) if (complete.includes(excluded)) return undefined
  for (const { field, value } of parsed.fieldTerms) {
    if (!normalize(document.fields[field] ?? '').includes(value)) return undefined
  }

  let score = 0
  const matchedFields = new Set<string>()
  for (const phrase of parsed.phrases) {
    if (title.includes(phrase)) { score += 12; matchedFields.add('title') }
    else if (body.includes(phrase)) { score += 7; matchedFields.add('body') }
    else return undefined
  }
  for (const term of parsed.terms) {
    const expanded = expandTerm(term)
    let matched = false
    for (const candidate of expanded) {
      if (title === candidate) { score += 10; matchedFields.add('title'); matched = true }
      else if (title.includes(candidate)) { score += 6; matchedFields.add('title'); matched = true }
      if (body.includes(candidate)) { score += candidate === term ? 3 : 1.5; matchedFields.add('body'); matched = true }
      if (tags.includes(candidate)) { score += 4; matchedFields.add('tags'); matched = true }
      for (const [field, value] of Object.entries(document.fields)) {
        if (normalize(value).includes(candidate)) { score += 2.5; matchedFields.add(field); matched = true }
      }
    }
    if (!matched && parsed.terms.length <= 2) score -= 1
  }
  for (const intent of parsed.semanticIntents) {
    if (intent === 'temporal_change' && document.type === 'change') score += 9
    if (intent === 'review' && document.state === 'review') score += 8
    if (intent === 'media_moment' && document.type === 'transcript_segment') score += 8
    if (intent === 'evidence' && document.evidenceAssetIds.length) score += 4
  }
  if (!parsed.terms.length && !parsed.phrases.length && !parsed.fieldTerms.length) score = 1
  if (document.confidence !== undefined) score *= 0.75 + document.confidence * 0.25
  return score > 0 ? { score, fields: [...matchedFields] } : undefined
}

function passesFilters(document: SearchDocument, query: SearchQuery): boolean {
  if (query.sceneIds?.length && !query.sceneIds.includes(document.sceneId)) return false
  if (query.lensIds?.length && (!document.lensId || !query.lensIds.includes(document.lensId as never))) return false
  if (query.states?.length && (!document.state || !query.states.includes(document.state as never))) return false
  if (query.assetKinds?.length && (!document.assetKind || !query.assetKinds.includes(document.assetKind as never))) return false
  if (query.minConfidence !== undefined && (document.confidence ?? 0) < query.minConfidence) return false
  if (query.capturedAfter && (!document.capturedAt || Date.parse(document.capturedAt) < Date.parse(query.capturedAfter))) return false
  if (query.capturedBefore && (!document.capturedAt || Date.parse(document.capturedAt) > Date.parse(query.capturedBefore))) return false
  if (query.tags?.length && !query.tags.every(tag => document.tags.includes(tag))) return false
  return true
}

function excerpt(document: SearchDocument, terms: string[]): string {
  const source = document.body.trim()
  if (source.length <= 240) return source
  const normalized = source.toLowerCase()
  const index = terms.reduce((best, term) => {
    const candidate = normalized.indexOf(term)
    return candidate >= 0 && (best < 0 || candidate < best) ? candidate : best
  }, -1)
  const start = Math.max(0, (index < 0 ? 0 : index) - 70)
  const end = Math.min(source.length, start + 240)
  return `${start ? '…' : ''}${source.slice(start, end)}${end < source.length ? '…' : ''}`
}

export function searchDatabase(database: DatabaseShape, query: SearchQuery): SearchResult {
  const started = performance.now()
  const parsed = parseQuery(query.text)
  const cursor = decodeCursor<{ offset: number }>(query.cursor)
  const offset = typeof cursor?.offset === 'number' ? cursor.offset : 0
  const limit = Math.min(100, Math.max(1, query.limit ?? 30))
  const matches = documents(database)
    .filter(document => passesFilters(document, query))
    .map(document => ({ document, scored: scoreDocument(document, parsed) }))
    .filter((item): item is { document: SearchDocument; scored: { score: number; fields: string[] } } => Boolean(item.scored))
    .sort((a, b) => b.scored.score - a.scored.score || Date.parse(b.document.capturedAt ?? '0') - Date.parse(a.document.capturedAt ?? '0'))

  const page = matches.slice(offset, offset + limit)
  const hits: SearchHit[] = page.map(({ document, scored }) => ({
    id: document.id,
    type: document.type,
    sceneId: document.sceneId,
    score: Number(scored.score.toFixed(4)),
    title: document.title,
    excerpt: excerpt(document, [...parsed.terms, ...parsed.phrases]),
    matchedFields: scored.fields,
    evidenceAssetIds: document.evidenceAssetIds,
    metadata: document.metadata,
  }))
  const facets = {
    types: {} as Record<string, number>,
    states: {} as Record<string, number>,
    lenses: {} as Record<string, number>,
  }
  for (const { document } of matches) {
    facets.types[document.type] = (facets.types[document.type] ?? 0) + 1
    if (document.state) facets.states[document.state] = (facets.states[document.state] ?? 0) + 1
    if (document.lensId) facets.lenses[document.lensId] = (facets.lenses[document.lensId] ?? 0) + 1
  }
  return {
    query,
    hits,
    total: matches.length,
    elapsedMs: Number((performance.now() - started).toFixed(2)),
    ...(offset + limit < matches.length ? { nextCursor: encodeCursor({ offset: offset + limit }) } : {}),
    facets,
  }
}
