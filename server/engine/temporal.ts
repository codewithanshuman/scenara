import type {
  ChangeKind, ChangeSignificance, Observation, SceneChange, SceneEntity,
} from '../../shared/domain.js'
import { createId, now } from '../lib/id.js'

const severityRank: Record<NonNullable<Observation['severity']>, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
}

export interface TemporalComparison {
  before?: Observation
  after?: Observation
  kind: ChangeKind
  significance: ChangeSignificance
  confidence: number
  reasons: string[]
  attributeChanges: Array<{ key: string; before: unknown; after: unknown }>
}

function comparableValue(value: unknown): string {
  if (Array.isArray(value)) return [...value].map(String).sort().join('|')
  if (value == null) return ''
  return String(value).trim().toLowerCase()
}

function attributeChanges(before: Observation, after: Observation): TemporalComparison['attributeChanges'] {
  const keys = new Set([...Object.keys(before.attributes), ...Object.keys(after.attributes)])
  const result: TemporalComparison['attributeChanges'] = []
  for (const key of keys) {
    const previous = before.attributes[key]
    const next = after.attributes[key]
    if (comparableValue(previous) !== comparableValue(next)) result.push({ key, before: previous, after: next })
  }
  return result
}

function primaryRegion(observation: Observation): { x: number; y: number } | undefined {
  const region = observation.evidence.find(item => item.region)?.region
  if (!region) return undefined
  return { x: region.x + region.width / 2, y: region.y + region.height / 2 }
}

function movement(before: Observation, after: Observation): number {
  const left = primaryRegion(before)
  const right = primaryRegion(after)
  if (!left || !right) return 0
  return Math.hypot(right.x - left.x, right.y - left.y)
}

function significanceFor(before: Observation, after: Observation, changes: TemporalComparison['attributeChanges']): ChangeSignificance {
  const previousSeverity = before.severity ? severityRank[before.severity] : 0
  const nextSeverity = after.severity ? severityRank[after.severity] : 0
  if (nextSeverity >= 4 || nextSeverity - previousSeverity >= 2) return 'critical'
  if (nextSeverity >= 2 || changes.length >= 3 || before.condition !== after.condition) return 'meaningful'
  if (changes.length || previousSeverity !== nextSeverity) return 'minor'
  return 'informational'
}

export function compareObservations(before: Observation | undefined, after: Observation | undefined): TemporalComparison {
  if (!before && !after) throw new Error('At least one observation is required for temporal comparison')
  if (!before && after) {
    return {
      after,
      kind: 'appeared',
      significance: after.severity === 'high' || after.severity === 'critical' ? 'critical' : 'meaningful',
      confidence: after.confidence,
      reasons: ['Entity appears in the later capture without prior supporting evidence'],
      attributeChanges: [],
    }
  }
  if (before && !after) {
    return {
      before,
      kind: 'disappeared',
      significance: before.severity === 'high' || before.severity === 'critical' ? 'meaningful' : 'minor',
      confidence: before.confidence * 0.9,
      reasons: ['Entity is absent from the later capture'],
      attributeChanges: [],
    }
  }

  const left = before!
  const right = after!
  const changes = attributeChanges(left, right)
  const reasons: string[] = []
  if (left.condition !== right.condition) reasons.push(`Condition changed from '${left.condition ?? 'unspecified'}' to '${right.condition ?? 'unspecified'}'`)
  if (left.severity !== right.severity) reasons.push(`Severity changed from '${left.severity ?? 'none'}' to '${right.severity ?? 'none'}'`)
  if (changes.length) reasons.push(`${changes.length} structured attribute${changes.length === 1 ? '' : 's'} changed`)
  const displacement = movement(left, right)
  if (displacement >= 0.08) reasons.push(`Visible region moved by ${(displacement * 100).toFixed(1)}% of the normalized frame`)

  const kind: ChangeKind = displacement >= 0.08
    ? 'moved'
    : reasons.length
      ? 'modified'
      : 'unchanged'
  const significance = kind === 'unchanged' ? 'informational' : significanceFor(left, right, changes)
  const evidenceFactor = Math.min(1, (left.evidence.length + right.evidence.length) / 4)
  const confidence = Math.max(0, Math.min(1, ((left.confidence + right.confidence) / 2) * (0.8 + evidenceFactor * 0.2)))
  return { before: left, after: right, kind, significance, confidence, reasons, attributeChanges: changes }
}

function titleFor(entity: SceneEntity, comparison: TemporalComparison): string {
  const name = entity.displayName
  switch (comparison.kind) {
    case 'appeared': return `${name} appeared`
    case 'disappeared': return `${name} is no longer visible`
    case 'moved': return `${name} changed position`
    case 'modified': return `${name} changed condition`
    default: return `${name} remained stable`
  }
}

export function materializeChange(entity: SceneEntity, comparison: TemporalComparison): SceneChange {
  const before = comparison.before
  const after = comparison.after
  const createdAt = now()
  const description = comparison.reasons.length
    ? comparison.reasons.join('. ')
    : 'No meaningful visible difference was detected between the selected observations.'
  return {
    id: createId('chg'),
    sceneId: entity.sceneId,
    entityId: entity.id,
    beforeObservationId: before?.id,
    afterObservationId: after?.id,
    kind: comparison.kind,
    significance: comparison.significance,
    title: titleFor(entity, comparison),
    description,
    confidence: comparison.confidence,
    firstSeenAt: before?.capturedAt ?? after!.capturedAt,
    lastSeenAt: after?.capturedAt ?? before!.capturedAt,
    evidenceAssetIds: [...new Set([
      ...(before?.evidence.map(item => item.assetId) ?? []),
      ...(after?.evidence.map(item => item.assetId) ?? []),
    ])],
    requiresReview: comparison.significance === 'critical' || comparison.confidence < 0.8,
    createdAt,
    version: 1,
  }
}

export function compareEntityTimeline(entity: SceneEntity, observations: Observation[]): SceneChange[] {
  const timeline = observations
    .filter(observation => entity.observationIds.includes(observation.id))
    .sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt))
  const result: SceneChange[] = []
  for (let index = 1; index < timeline.length; index += 1) {
    const comparison = compareObservations(timeline[index - 1], timeline[index])
    if (comparison.kind !== 'unchanged') result.push(materializeChange(entity, comparison))
  }
  return result
}
