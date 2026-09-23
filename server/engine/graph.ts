import type {
  DatabaseShape, SceneGraph, SceneGraphEdge, SceneGraphNode, UUID,
} from '../../shared/domain.js'
import { stableId } from '../lib/id.js'

function node(
  id: UUID,
  type: SceneGraphNode['type'],
  label: string,
  options: Partial<Omit<SceneGraphNode, 'id' | 'type' | 'label'>> = {},
): SceneGraphNode {
  return { id, type, label, data: {}, ...options }
}

function edge(
  source: UUID,
  target: UUID,
  type: SceneGraphEdge['type'],
  weight = 1,
  data?: Record<string, unknown>,
): SceneGraphEdge {
  return {
    id: stableId('edge', source, target, type),
    source,
    target,
    type,
    weight,
    ...(data ? { data } : {}),
  }
}

export function buildSceneGraph(database: DatabaseShape, sceneId: string): SceneGraph {
  const scene = database.scenes.find(item => item.id === sceneId)
  if (!scene) throw new Error(`Scene '${sceneId}' was not found`)
  const nodes: SceneGraphNode[] = []
  const edges: SceneGraphEdge[] = []
  nodes.push(node(scene.id, 'scene', scene.title, {
    subtitle: scene.locationLabel,
    state: scene.status,
    data: { sequence: scene.sequence, captureStart: scene.captureStart, captureEnd: scene.captureEnd, tags: scene.tags },
  }))

  for (const asset of database.assets.filter(item => item.sceneId === sceneId)) {
    nodes.push(node(asset.id, 'asset', asset.sourceFilename, {
      subtitle: `${asset.kind} · ${asset.origin}`,
      state: asset.origin,
      data: {
        kind: asset.kind,
        capturedAt: asset.capturedAt,
        url: asset.cloudinary?.secureUrl ?? asset.localUrl,
        dimensions: asset.dimensions,
        tags: asset.tags,
      },
    }))
    edges.push(edge(scene.id, asset.id, 'contains'))
    if (asset.parentAssetId) edges.push(edge(asset.parentAssetId, asset.id, 'derived_from'))
  }

  for (const entity of database.entities.filter(item => item.sceneId === sceneId)) {
    nodes.push(node(entity.id, 'entity', entity.displayName, {
      subtitle: `${entity.observationIds.length} observations`,
      data: { aliases: entity.aliases, centroid: entity.centroid, stableAttributes: entity.stableAttributes },
    }))
    edges.push(edge(scene.id, entity.id, 'contains'))
  }

  for (const observation of database.observations.filter(item => item.sceneId === sceneId)) {
    nodes.push(node(observation.id, 'observation', observation.label, {
      subtitle: observation.description,
      state: observation.state,
      confidence: observation.confidence,
      data: {
        lensId: observation.lensId,
        condition: observation.condition,
        severity: observation.severity,
        requiresReview: observation.requiresReview,
        capturedAt: observation.capturedAt,
        attributes: observation.attributes,
      },
    }))
    if (observation.entityId) edges.push(edge(observation.entityId, observation.id, 'observes', observation.confidence))
    else edges.push(edge(scene.id, observation.id, 'contains', observation.confidence))
    for (const evidence of observation.evidence) {
      edges.push(edge(evidence.assetId, observation.id, 'supports', observation.confidence, {
        region: evidence.region,
        frameTimeSeconds: evidence.frameTimeSeconds,
        transcriptSegmentId: evidence.transcriptSegmentId,
      }))
    }
  }

  for (const change of database.changes.filter(item => item.sceneId === sceneId)) {
    nodes.push(node(change.id, 'change', change.title, {
      subtitle: change.description,
      state: change.significance,
      confidence: change.confidence,
      data: { kind: change.kind, firstSeenAt: change.firstSeenAt, lastSeenAt: change.lastSeenAt },
    }))
    if (change.entityId) edges.push(edge(change.entityId, change.id, 'changes', change.confidence))
    if (change.beforeObservationId) edges.push(edge(change.beforeObservationId, change.id, 'compares', change.confidence, { role: 'before' }))
    if (change.afterObservationId) edges.push(edge(change.afterObservationId, change.id, 'compares', change.confidence, { role: 'after' }))
  }

  for (const transcript of database.transcripts) {
    const asset = database.assets.find(item => item.id === transcript.assetId && item.sceneId === sceneId)
    if (!asset) continue
    nodes.push(node(transcript.id, 'transcript', `${asset.sourceFilename} transcript`, {
      subtitle: `${transcript.segments.length} segments · ${transcript.language}`,
      data: { text: transcript.text, source: transcript.source },
    }))
    edges.push(edge(asset.id, transcript.id, 'describes'))
    for (const segment of transcript.segments) {
      for (const observationId of segment.linkedObservationIds) {
        edges.push(edge(transcript.id, observationId, 'mentions', 1, {
          segmentId: segment.id,
          startSeconds: segment.startSeconds,
          endSeconds: segment.endSeconds,
          text: segment.text,
        }))
      }
    }
  }

  for (const scenario of database.scenarios.filter(item => item.sceneId === sceneId)) {
    nodes.push(node(scenario.id, 'scenario', scenario.title, {
      subtitle: scenario.transformation,
      state: scenario.status,
      data: { prompt: scenario.prompt, parameters: scenario.parameters, createdAt: scenario.createdAt },
    }))
    edges.push(edge(scenario.sourceAssetId, scenario.id, 'derived_from'))
    if (scenario.outputAssetId) edges.push(edge(scenario.id, scenario.outputAssetId, 'derived_from'))
  }

  return {
    sceneId,
    generatedAt: new Date().toISOString(),
    version: scene.version,
    nodes,
    edges,
  }
}

export function neighborhood(graph: SceneGraph, rootId: string, depth = 1): SceneGraph {
  const ids = new Set([rootId])
  let frontier = new Set([rootId])
  for (let level = 0; level < depth; level += 1) {
    const next = new Set<string>()
    for (const item of graph.edges) {
      if (frontier.has(item.source) && !ids.has(item.target)) next.add(item.target)
      if (frontier.has(item.target) && !ids.has(item.source)) next.add(item.source)
    }
    for (const id of next) ids.add(id)
    frontier = next
    if (!frontier.size) break
  }
  return {
    ...graph,
    nodes: graph.nodes.filter(item => ids.has(item.id)),
    edges: graph.edges.filter(item => ids.has(item.source) && ids.has(item.target)),
  }
}
