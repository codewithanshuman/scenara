import type { BoundingBox, Observation, SceneEntity } from '../../shared/domain.js'
import { createId, now } from '../lib/id.js'

export interface EntityLinkCandidate {
  entity: SceneEntity
  score: number
  components: {
    label: number
    aliases: number
    spatial: number
    attributes: number
    recency: number
  }
}

export interface EntityLinkResult {
  entity: SceneEntity
  created: boolean
  score: number
  candidates: EntityLinkCandidate[]
}

export interface EntityLinkerOptions {
  matchThreshold: number
  ambiguityDelta: number
  spatialWeight: number
  labelWeight: number
  attributeWeight: number
  recencyWeight: number
}

const defaultOptions: EntityLinkerOptions = {
  matchThreshold: 0.62,
  ambiguityDelta: 0.08,
  spatialWeight: 0.25,
  labelWeight: 0.45,
  attributeWeight: 0.2,
  recencyWeight: 0.1,
}

const stopWords = new Set(['a', 'an', 'and', 'at', 'in', 'near', 'of', 'on', 'the', 'to', 'with'])

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]+/g, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(value: string): Set<string> {
  return new Set(normalize(value).split(' ').filter(token => token && !stopWords.has(token)))
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (!left.size && !right.size) return 1
  let intersection = 0
  for (const value of left) if (right.has(value)) intersection += 1
  const union = new Set([...left, ...right]).size
  return union ? intersection / union : 0
}

function regionFromObservation(observation: Observation): BoundingBox | undefined {
  return observation.evidence.find(item => item.region)?.region
}

function centroid(region: BoundingBox | undefined): { x: number; y: number } | undefined {
  if (!region) return undefined
  return { x: region.x + region.width / 2, y: region.y + region.height / 2 }
}

function spatialSimilarity(observation: Observation, entity: SceneEntity): number {
  const point = centroid(regionFromObservation(observation))
  if (!point || !entity.centroid) return 0.5
  const distance = Math.hypot(point.x - entity.centroid.x, point.y - entity.centroid.y)
  return Math.max(0, 1 - distance / Math.SQRT2)
}

function primitiveTokens(value: unknown): Set<string> {
  if (Array.isArray(value)) return tokens(value.join(' '))
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return tokens(String(value))
  return new Set()
}

function attributeSimilarity(observation: Observation, entity: SceneEntity): number {
  const keys = new Set([...Object.keys(observation.attributes), ...Object.keys(entity.stableAttributes)])
  if (!keys.size) return 0.5
  let score = 0
  let compared = 0
  for (const key of keys) {
    const left = observation.attributes[key]
    const right = entity.stableAttributes[key]
    if (left == null || right == null) continue
    compared += 1
    if (left === right) score += 1
    else score += jaccard(primitiveTokens(left), primitiveTokens(right))
  }
  return compared ? score / compared : 0.5
}

function recencySimilarity(observation: Observation, entity: SceneEntity): number {
  const days = Math.abs(Date.parse(observation.capturedAt) - Date.parse(entity.lastObservedAt)) / 86_400_000
  return Math.exp(-days / 45)
}

function labelSimilarity(observation: Observation, entity: SceneEntity): { label: number; aliases: number } {
  const observationTokens = tokens(`${observation.canonicalLabel} ${observation.label}`)
  const canonical = jaccard(observationTokens, tokens(`${entity.canonicalLabel} ${entity.displayName}`))
  const aliasScore = entity.aliases.reduce((best, alias) => Math.max(best, jaccard(observationTokens, tokens(alias))), 0)
  if (normalize(observation.canonicalLabel) === normalize(entity.canonicalLabel)) return { label: 1, aliases: aliasScore }
  return { label: canonical, aliases: aliasScore }
}

function mergeStableAttributes(
  previous: SceneEntity['stableAttributes'],
  incoming: Observation['attributes'],
): SceneEntity['stableAttributes'] {
  const result = { ...previous }
  for (const [key, value] of Object.entries(incoming)) {
    if (result[key] === undefined || result[key] === null) result[key] = value
    else if (Array.isArray(result[key]) && Array.isArray(value)) result[key] = [...new Set([...result[key] as string[], ...value])]
  }
  return result
}

export class EntityLinker {
  readonly options: EntityLinkerOptions

  constructor(options: Partial<EntityLinkerOptions> = {}) {
    this.options = { ...defaultOptions, ...options }
  }

  rank(observation: Observation, entities: SceneEntity[]): EntityLinkCandidate[] {
    return entities
      .filter(entity => entity.sceneId === observation.sceneId)
      .map(entity => {
        const labels = labelSimilarity(observation, entity)
        const spatial = spatialSimilarity(observation, entity)
        const attributes = attributeSimilarity(observation, entity)
        const recency = recencySimilarity(observation, entity)
        const effectiveLabel = Math.max(labels.label, labels.aliases * 0.92)
        const score =
          effectiveLabel * this.options.labelWeight +
          spatial * this.options.spatialWeight +
          attributes * this.options.attributeWeight +
          recency * this.options.recencyWeight
        return { entity, score, components: { ...labels, spatial, attributes, recency } }
      })
      .sort((a, b) => b.score - a.score)
  }

  link(observation: Observation, entities: SceneEntity[]): EntityLinkResult {
    const candidates = this.rank(observation, entities)
    const best = candidates[0]
    const runnerUp = candidates[1]
    const ambiguous = best && runnerUp && best.score - runnerUp.score < this.options.ambiguityDelta
    if (!best || best.score < this.options.matchThreshold || ambiguous) {
      const createdAt = now()
      const point = centroid(regionFromObservation(observation))
      const entity: SceneEntity = {
        id: createId('ent'),
        sceneId: observation.sceneId,
        canonicalLabel: normalize(observation.canonicalLabel).replaceAll(' ', '_'),
        displayName: observation.label,
        aliases: [...new Set([observation.label, observation.canonicalLabel])],
        firstObservedAt: observation.capturedAt,
        lastObservedAt: observation.capturedAt,
        observationIds: [observation.id],
        assetIds: [...new Set(observation.evidence.map(item => item.assetId))],
        ...(point ? { centroid: point } : {}),
        stableAttributes: { ...observation.attributes },
        createdAt,
        updatedAt: createdAt,
        version: 1,
      }
      return { entity, created: true, score: best?.score ?? 0, candidates: candidates.slice(0, 5) }
    }

    const point = centroid(regionFromObservation(observation))
    const entity = structuredClone(best.entity)
    entity.observationIds = [...new Set([...entity.observationIds, observation.id])]
    entity.assetIds = [...new Set([...entity.assetIds, ...observation.evidence.map(item => item.assetId)])]
    entity.aliases = [...new Set([...entity.aliases, observation.label, observation.canonicalLabel])]
    entity.firstObservedAt = new Date(Math.min(Date.parse(entity.firstObservedAt), Date.parse(observation.capturedAt))).toISOString()
    entity.lastObservedAt = new Date(Math.max(Date.parse(entity.lastObservedAt), Date.parse(observation.capturedAt))).toISOString()
    if (point) {
      const count = Math.max(1, entity.observationIds.length - 1)
      entity.centroid = entity.centroid
        ? { x: (entity.centroid.x * count + point.x) / (count + 1), y: (entity.centroid.y * count + point.y) / (count + 1) }
        : point
    }
    entity.stableAttributes = mergeStableAttributes(entity.stableAttributes, observation.attributes)
    entity.updatedAt = now()
    entity.version += 1
    return { entity, created: false, score: best.score, candidates: candidates.slice(0, 5) }
  }
}
