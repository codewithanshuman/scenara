import { canonicalize } from './serialization.js'
import type { MediaAsset, ProvenanceAction, ProvenanceEvent } from '../../shared/domain.js'
import { createId, now, sha256 } from '../lib/id.js'

export interface AppendProvenanceInput {
  sceneId: string
  assetId: string
  action: ProvenanceAction
  actorType: ProvenanceEvent['actorType']
  actorId: string
  inputFingerprint: string
  outputFingerprint: string
  parameters?: Record<string, unknown>
  providerReference?: string
}

function eventPayload(event: Omit<ProvenanceEvent, 'hash'>): string {
  return canonicalize({
    id: event.id,
    sceneId: event.sceneId,
    assetId: event.assetId,
    parentEventId: event.parentEventId ?? null,
    action: event.action,
    actorType: event.actorType,
    actorId: event.actorId,
    inputFingerprint: event.inputFingerprint,
    outputFingerprint: event.outputFingerprint,
    parameters: event.parameters,
    providerReference: event.providerReference ?? null,
    occurredAt: event.occurredAt,
    previousHash: event.previousHash ?? null,
  })
}

export function appendProvenance(chain: ProvenanceEvent[], input: AppendProvenanceInput): ProvenanceEvent {
  const assetEvents = chain
    .filter(event => event.assetId === input.assetId)
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
  const previous = assetEvents.at(-1)
  const unsigned: Omit<ProvenanceEvent, 'hash'> = {
    id: createId('prv'),
    sceneId: input.sceneId,
    assetId: input.assetId,
    ...(previous ? { parentEventId: previous.id, previousHash: previous.hash } : {}),
    action: input.action,
    actorType: input.actorType,
    actorId: input.actorId,
    inputFingerprint: input.inputFingerprint,
    outputFingerprint: input.outputFingerprint,
    parameters: input.parameters ?? {},
    ...(input.providerReference ? { providerReference: input.providerReference } : {}),
    occurredAt: now(),
  }
  return { ...unsigned, hash: sha256(eventPayload(unsigned)) }
}

export interface ProvenanceVerification {
  valid: boolean
  checked: number
  brokenEventId?: string
  reason?: string
}

export function verifyProvenance(chain: ProvenanceEvent[], assetId?: string): ProvenanceVerification {
  const events = chain
    .filter(event => !assetId || event.assetId === assetId)
    .sort((a, b) => {
      const byAsset = a.assetId.localeCompare(b.assetId)
      return byAsset || Date.parse(a.occurredAt) - Date.parse(b.occurredAt)
    })
  const previousByAsset = new Map<string, ProvenanceEvent>()
  for (const event of events) {
    const previous = previousByAsset.get(event.assetId)
    const { hash, ...unsigned } = event
    const expected = sha256(eventPayload(unsigned))
    if (hash !== expected) return { valid: false, checked: previousByAsset.size, brokenEventId: event.id, reason: 'Event hash mismatch' }
    if (previous) {
      if (event.parentEventId !== previous.id) return { valid: false, checked: previousByAsset.size, brokenEventId: event.id, reason: 'Parent event mismatch' }
      if (event.previousHash !== previous.hash) return { valid: false, checked: previousByAsset.size, brokenEventId: event.id, reason: 'Previous hash mismatch' }
    } else if (event.previousHash || event.parentEventId) {
      return { valid: false, checked: previousByAsset.size, brokenEventId: event.id, reason: 'First event unexpectedly references a parent' }
    }
    previousByAsset.set(event.assetId, event)
  }
  return { valid: true, checked: events.length }
}

export function assetFingerprint(asset: MediaAsset): string {
  return sha256(canonicalize({
    id: asset.id,
    sha256: asset.sha256,
    cloudinaryAssetId: asset.cloudinary?.assetId ?? null,
    publicId: asset.cloudinary?.publicId ?? null,
    version: asset.cloudinary?.version ?? null,
    bytes: asset.byteLength,
    mimeType: asset.mimeType,
    origin: asset.origin,
    parentAssetId: asset.parentAssetId ?? null,
  }))
}
