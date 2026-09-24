import type { z } from 'zod'
import type {
  AnalysisRun, MediaAsset, Observation, ReviewRecord, ScenarioBranch, Scene, SearchQuery,
} from '../shared/domain.js'
import {
  AnalyzeAssetSchema, CreateObservationSchema, CreateScenarioSchema, CreateSceneSchema,
  RegisterAssetSchema, ReviewObservationSchema, SearchRequestSchema, UpdateSceneSchema,
  UploadSignatureSchema,
} from '../shared/contracts.js'
import type { ServerConfig } from './config.js'
import type { DatabaseStore } from './db/store.js'
import { buildVisionPrompt, parseVisionResponse, type VisionAnalysis } from './analysis/schema.js'
import { CloudinaryClient } from './integrations/cloudinary.js'
import { EntityLinker } from './engine/entity-linker.js'
import { buildSceneGraph, neighborhood } from './engine/graph.js'
import { appendProvenance, assetFingerprint, verifyProvenance } from './engine/provenance.js'
import { searchDatabase } from './engine/search.js'
import { compareEntityTimeline } from './engine/temporal.js'
import { DurableJobQueue } from './jobs/queue.js'
import { ConflictError, NotFoundError, ValidationError } from './lib/errors.js'
import { createId, now, sha256 } from './lib/id.js'
import { KnowledgeCatalogStore } from './knowledge/catalog.js'
import { evaluateKnowledgePolicy } from './engine/policy.js'
import { KnowledgeQuerySchema, PolicyEvaluationSchema } from './knowledge/schema.js'

type CreateSceneInput = z.infer<typeof CreateSceneSchema>
type UpdateSceneInput = z.infer<typeof UpdateSceneSchema>
type RegisterAssetInput = z.infer<typeof RegisterAssetSchema>
type CreateObservationInput = z.infer<typeof CreateObservationSchema>
type ReviewObservationInput = z.infer<typeof ReviewObservationSchema>
type CreateScenarioInput = z.infer<typeof CreateScenarioSchema>
type AnalyzeAssetInput = z.infer<typeof AnalyzeAssetSchema>

export class ScenaraApplication {
  readonly config: ServerConfig
  readonly database: DatabaseStore
  readonly cloudinary: CloudinaryClient
  readonly linker: EntityLinker
  readonly jobs: DurableJobQueue
  readonly knowledge: KnowledgeCatalogStore

  constructor(config: ServerConfig, database: DatabaseStore) {
    this.config = config
    this.database = database
    this.cloudinary = new CloudinaryClient(config.cloudinary)
    this.linker = new EntityLinker()
    this.jobs = new DurableJobQueue(database, 2, config.serverless ? 'inline' : 'background')
    this.knowledge = new KnowledgeCatalogStore()
  }

  status() {
    const snapshot = this.database.snapshot()
    return {
      status: 'ok',
      mode: this.cloudinary.enabled ? 'cloudinary' : 'local-adapter',
      persistence: this.database.kind,
      execution: this.config.serverless ? 'request-safe-inline' : 'background-worker',
      revision: snapshot.revision,
      counts: {
        scenes: snapshot.scenes.length,
        assets: snapshot.assets.length,
        entities: snapshot.entities.length,
        observations: snapshot.observations.length,
        changes: snapshot.changes.length,
        reviewQueue: snapshot.observations.filter(item => item.requiresReview && item.state !== 'dismissed').length,
        activeJobs: snapshot.jobs.filter(item => ['queued', 'running'].includes(item.status)).length,
        knowledgeRules: this.knowledge.catalog.metadata.ruleCount,
      },
    }
  }

  knowledgeMetadata(){ return this.knowledge.metadata() }

  queryKnowledge(raw:unknown){ return this.knowledge.query(KnowledgeQuerySchema.parse(raw)) }

  knowledgeRule(ruleId:string){ return this.knowledge.get(ruleId) }

  evaluatePolicy(raw:unknown){
    const input=PolicyEvaluationSchema.parse(raw)
    return evaluateKnowledgePolicy(this.knowledge.get(input.ruleId),input)
  }

  listScenes(options: { status?: string; workspaceId?: string; limit?: number } = {}) {
    const snapshot = this.database.snapshot()
    return snapshot.scenes
      .filter(scene => !options.status || scene.status === options.status)
      .filter(scene => !options.workspaceId || scene.workspaceId === options.workspaceId)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, options.limit ?? 100)
      .map(scene => this.sceneSummary(scene, snapshot))
  }

  getScene(sceneId: string) {
    const snapshot = this.database.snapshot()
    const scene = snapshot.scenes.find(item => item.id === sceneId)
    if (!scene) throw new NotFoundError('Scene', sceneId)
    return {
      ...scene,
      assets: snapshot.assets.filter(item => item.sceneId === sceneId),
      entities: snapshot.entities.filter(item => item.sceneId === sceneId),
      observations: snapshot.observations.filter(item => item.sceneId === sceneId),
      changes: snapshot.changes.filter(item => item.sceneId === sceneId),
      transcripts: snapshot.transcripts.filter(item => scene.assetIds.includes(item.assetId)),
      scenarios: snapshot.scenarios.filter(item => item.sceneId === sceneId),
      jobs: snapshot.jobs.filter(item => item.sceneId === sceneId),
      reviewCount: snapshot.observations.filter(item => item.sceneId === sceneId && item.requiresReview && item.state !== 'dismissed').length,
    }
  }

  async createScene(raw: unknown, actorId: string): Promise<Scene> {
    const input: CreateSceneInput = CreateSceneSchema.parse(raw)
    const timestamp = now()
    const snapshot = this.database.snapshot()
    const scene: Scene = {
      id: createId('scene'),
      sequence: Math.max(0, ...snapshot.scenes.map(item => item.sequence)) + 1,
      slug: this.uniqueSceneSlug(input.title, snapshot.scenes),
      title: input.title,
      description: input.description,
      status: 'draft',
      locationLabel: input.locationLabel,
      workspaceId: snapshot.workspaces[0]?.id ?? 'workspace_default',
      captureStart: input.captureStart,
      captureEnd: input.captureEnd,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: actorId,
      activeLensIds: input.activeLensIds,
      assetIds: [], entityIds: [], observationIds: [], changeIds: [], tags: input.tags, version: 1,
    }
    await this.database.transaction(draft => { draft.scenes.push(scene) })
    return scene
  }

  async updateScene(sceneId: string, raw: unknown): Promise<Scene> {
    const input: UpdateSceneInput = UpdateSceneSchema.parse(raw)
    let updated!: Scene
    await this.database.transaction(draft => {
      const index = draft.scenes.findIndex(item => item.id === sceneId)
      if (index < 0) throw new NotFoundError('Scene', sceneId)
      const previous = draft.scenes[index]
      if (previous.version !== input.expectedVersion) {
        throw new ConflictError('Scene changed after it was opened', { expectedVersion: input.expectedVersion, actualVersion: previous.version })
      }
      const { expectedVersion: _, ...patch } = input
      updated = { ...previous, ...patch, updatedAt: now(), version: previous.version + 1 }
      draft.scenes[index] = updated
    })
    return updated
  }

  async registerAsset(raw: unknown, actorId: string): Promise<MediaAsset> {
    const input: RegisterAssetInput = RegisterAssetSchema.parse(raw)
    const timestamp = now()
    const asset: MediaAsset = {
      id: createId('asset'), sceneId: input.sceneId, kind: input.kind, origin: 'original',
      sourceFilename: input.sourceFilename, mimeType: input.mimeType, sha256: input.sha256,
      byteLength: input.byteLength, capturedAt: input.capturedAt, uploadedAt: timestamp,
      dimensions: input.dimensions, ...(input.localUrl ? { localUrl: input.localUrl } : {}),
      ...(input.cloudinary ? { cloudinary: input.cloudinary } : {}),
      observationIds: [], provenanceEventIds: [], structuredMetadata: {
        scenara_scene_id: input.sceneId, scenara_origin: 'original',
      }, tags: input.tags, version: 1,
    }

    await this.database.transaction(draft => {
      const scene = draft.scenes.find(item => item.id === input.sceneId)
      if (!scene) throw new NotFoundError('Scene', input.sceneId)
      const duplicate = draft.assets.find(item => item.sceneId === input.sceneId && item.sha256 === input.sha256)
      if (duplicate) throw new ConflictError('This exact asset is already registered in the scene', { assetId: duplicate.id })
      const event = appendProvenance(draft.provenance, {
        sceneId: scene.id, assetId: asset.id, action: 'uploaded', actorType: 'human', actorId,
        inputFingerprint: asset.sha256, outputFingerprint: assetFingerprint(asset),
        parameters: { sourceFilename: asset.sourceFilename, byteLength: asset.byteLength, mode: asset.cloudinary ? 'cloudinary' : 'local' },
        providerReference: asset.cloudinary?.assetId,
      })
      asset.provenanceEventIds.push(event.id)
      draft.provenance.push(event)
      draft.assets.push(asset)
      scene.assetIds.push(asset.id)
      scene.coverAssetId ??= asset.kind === 'image' ? asset.id : undefined
      scene.status = 'processing'
      scene.updatedAt = timestamp
      scene.version += 1
    })
    return asset
  }

  async createObservation(raw: unknown): Promise<Observation> {
    const input: CreateObservationInput = CreateObservationSchema.parse(raw)
    const timestamp = now()
    const observation: Observation = {
      ...input,
      id: createId('obs'),
      state: input.requiresReview || input.confidence < 0.8 ? 'review' : 'ai_observation',
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
    }
    await this.database.transaction(draft => {
      const scene = draft.scenes.find(item => item.id === input.sceneId)
      if (!scene) throw new NotFoundError('Scene', input.sceneId)
      for (const evidence of input.evidence) {
        const asset = draft.assets.find(item => item.id === evidence.assetId && item.sceneId === input.sceneId)
        if (!asset) throw new ValidationError(`Evidence asset '${evidence.assetId}' does not belong to this scene`)
      }
      if (input.entityId && !draft.entities.some(item => item.id === input.entityId && item.sceneId === input.sceneId)) {
        throw new ValidationError(`Entity '${input.entityId}' does not belong to this scene`)
      }
      const result = input.entityId
        ? undefined
        : this.linker.link(observation, draft.entities.filter(item => item.sceneId === input.sceneId))
      if (result) {
        observation.entityId = result.entity.id
        const index = draft.entities.findIndex(item => item.id === result.entity.id)
        if (index >= 0) draft.entities[index] = result.entity
        else { draft.entities.push(result.entity); scene.entityIds.push(result.entity.id) }
      } else {
        const entity = draft.entities.find(item => item.id === observation.entityId)!
        if (!entity.observationIds.includes(observation.id)) entity.observationIds.push(observation.id)
        entity.assetIds = [...new Set([...entity.assetIds, ...input.evidence.map(item => item.assetId)])]
        entity.lastObservedAt = input.capturedAt
        entity.updatedAt = timestamp
        entity.version += 1
      }
      draft.observations.push(observation)
      scene.observationIds.push(observation.id)
      scene.status = observation.requiresReview ? 'review' : 'processing'
      scene.updatedAt = timestamp
      scene.version += 1
      for (const evidence of input.evidence) {
        const asset = draft.assets.find(item => item.id === evidence.assetId)!
        asset.observationIds.push(observation.id)
        asset.version += 1
      }
    })
    return observation
  }

  async reviewObservation(observationId: string, raw: unknown, reviewerId: string): Promise<{ observation: Observation; review: ReviewRecord }> {
    const input: ReviewObservationInput = ReviewObservationSchema.parse(raw)
    let result!: { observation: Observation; review: ReviewRecord }
    await this.database.transaction(draft => {
      const index = draft.observations.findIndex(item => item.id === observationId)
      if (index < 0) throw new NotFoundError('Observation', observationId)
      const previous = draft.observations[index]
      if (previous.version !== input.expectedVersion) {
        throw new ConflictError('Observation changed after it was opened', { expectedVersion: input.expectedVersion, actualVersion: previous.version })
      }
      const nextState: Observation['state'] = input.decision === 'dismissed'
        ? 'dismissed'
        : input.decision === 'deferred'
          ? 'review'
          : 'verified'
      const timestamp = now()
      const observation: Observation = {
        ...previous,
        ...(input.correction ?? {}),
        state: nextState,
        requiresReview: nextState === 'review',
        reviewedAt: timestamp,
        reviewedBy: reviewerId,
        updatedAt: timestamp,
        version: previous.version + 1,
      }
      const review: ReviewRecord = {
        id: createId('review'), sceneId: previous.sceneId, observationId, reviewerId,
        decision: input.decision, previousState: previous.state, nextState,
        ...(input.correction ? { correction: input.correction } : {}),
        ...(input.rationale ? { rationale: input.rationale } : {}),
        createdAt: timestamp, observationVersion: observation.version,
      }
      draft.observations[index] = observation
      draft.reviews.push(review)
      for (const evidence of observation.evidence) {
        const asset = draft.assets.find(item => item.id === evidence.assetId)
        if (!asset) continue
        const event = appendProvenance(draft.provenance, {
          sceneId: observation.sceneId, assetId: asset.id, action: 'reviewed', actorType: 'human', actorId: reviewerId,
          inputFingerprint: assetFingerprint(asset), outputFingerprint: sha256(JSON.stringify({ observationId, version: observation.version, decision: input.decision })),
          parameters: { observationId, reviewId: review.id, decision: input.decision, rationale: input.rationale },
        })
        draft.provenance.push(event)
        asset.provenanceEventIds.push(event.id)
      }
      result = { observation, review }
    })
    return result
  }

  async rebuildChanges(sceneId: string) {
    let created = 0
    await this.database.transaction(draft => {
      const scene = draft.scenes.find(item => item.id === sceneId)
      if (!scene) throw new NotFoundError('Scene', sceneId)
      const entities = draft.entities.filter(item => item.sceneId === sceneId)
      const observations = draft.observations.filter(item => item.sceneId === sceneId && item.state !== 'dismissed')
      const changes = entities.flatMap(entity => compareEntityTimeline(entity, observations))
      draft.changes = draft.changes.filter(item => item.sceneId !== sceneId).concat(changes)
      scene.changeIds = changes.map(item => item.id)
      scene.updatedAt = now()
      scene.version += 1
      created = changes.length
    })
    return { sceneId, created }
  }

  graph(sceneId: string, rootId?: string, depth = 1) {
    const graph = buildSceneGraph(this.database.snapshot(), sceneId)
    return rootId ? neighborhood(graph, rootId, Math.max(0, Math.min(6, depth))) : graph
  }

  search(raw: unknown) {
    const query = SearchRequestSchema.parse(raw) as SearchQuery
    return searchDatabase(this.database.snapshot(), query)
  }

  provenance(assetId: string) {
    const snapshot = this.database.snapshot()
    const asset = snapshot.assets.find(item => item.id === assetId)
    if (!asset) throw new NotFoundError('Asset', assetId)
    const events = snapshot.provenance.filter(item => item.assetId === assetId).sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
    return { asset, events, verification: verifyProvenance(events, assetId) }
  }

  uploadSignature(raw: unknown) {
    const input = UploadSignatureSchema.parse(raw)
    const snapshot = this.database.snapshot()
    if (!snapshot.scenes.some(item => item.id === input.sceneId)) throw new NotFoundError('Scene', input.sceneId)
    return this.cloudinary.createUploadSignature(input)
  }

  async analyzeAsset(raw: unknown) {
    const input: AnalyzeAssetInput = AnalyzeAssetSchema.parse(raw)
    const snapshot = this.database.snapshot()
    const asset = snapshot.assets.find(item => item.id === input.assetId)
    if (!asset) throw new NotFoundError('Asset', input.assetId)
    const baseFingerprint = sha256(`${asset.sha256}:${input.lensId}:${input.policyProfile}:${input.temporalMode}:${asset.version}:v2`)
    const requestFingerprint = input.force ? sha256(`${baseFingerprint}:${now()}:${createId('rerun')}`) : baseFingerprint
    const existing = snapshot.analyses.find(item => item.requestFingerprint === requestFingerprint && !input.force)
    const existingJob = existing && snapshot.jobs.find(item => item.payload.analysisId === existing.id)
    if (existing && existingJob) return { analysis: existing, job: existingJob }

    const timestamp = now()
    const analysis: AnalysisRun = {
      id: createId('analysis'), sceneId: asset.sceneId, assetId: asset.id, lensId: input.lensId,
      status: 'queued', provider: this.cloudinary.enabled ? 'cloudinary_ai_vision' : 'local_adapter',
      model: this.cloudinary.enabled ? 'ai_vision_general' : 'scenara-local-fixture-v1',
      promptVersion: 'scene-observation-v2-policy-grounded', requestFingerprint, observationIds: [], createdAt: timestamp, version: 1,
    }
    await this.database.transaction(draft => { draft.analyses.push(analysis) })
    const job = await this.jobs.enqueue({
      sceneId: asset.sceneId, assetId: asset.id, kind: 'analyze', maxAttempts: 3,
      idempotencyKey: requestFingerprint, payload: {
        analysisId: analysis.id, assetId: asset.id, lensId: input.lensId, async: input.async,
        policyProfile: input.policyProfile, temporalMode: input.temporalMode,
      },
    }, async context => {
      await context.progress(8, 'Preparing structured vision request')
      const latest = this.database.snapshot().assets.find(item => item.id === asset.id)!
      let vision: VisionAnalysis
      let rawResponse: unknown
      if (this.cloudinary.enabled) {
        await context.progress(22, 'Cloudinary AI Vision analyzing asset')
        const policyContext = this.knowledge.promptContext({
          lensId: input.lensId,
          profile: input.policyProfile,
          temporalMode: input.temporalMode,
          maxRules: 16,
        })
        const response = await this.cloudinary.analyze({
          asset: latest,
          lensId: input.lensId,
          prompt: buildVisionPrompt(input.lensId, policyContext),
          async: false,
        })
        rawResponse = response.raw
        if (!response.value) throw new ValidationError('Cloudinary completed analysis without a structured value')
        vision = parseVisionResponse(response.value)
      } else {
        await context.progress(38, 'Local adapter replaying deterministic analysis')
        vision = this.localVisionFixture(latest, input.lensId)
        rawResponse = vision
      }
      await context.progress(62, 'Normalizing observations')
      const created: string[] = []
      const policyEvaluations: Array<Record<string, unknown>> = []
      for (const item of vision.observations) {
        const current = this.database.snapshot()
        const historical = current.observations.filter(observation =>
          observation.sceneId === latest.sceneId
          && observation.canonicalLabel === item.canonical_label
          && observation.state !== 'dismissed',
        )
        const corroboratingSources = new Set([
          latest.id,
          ...historical.flatMap(observation => observation.evidence.map(evidence => evidence.assetId)),
        ]).size
        const temporalAgreement = historical.some(observation =>
          Boolean(item.condition && observation.condition)
          && observation.condition!.toLowerCase() === item.condition!.toLowerCase(),
        )
        const hasContradiction = historical.some(observation => this.observationsContradict(observation, item.condition, item.attributes))
        const rule = this.knowledge.findBest(item.canonical_label, input.policyProfile, input.temporalMode)
        const evaluation = rule ? evaluateKnowledgePolicy(rule, {
          ruleId: rule.id,
          modelConfidence: item.confidence,
          proposedSeverity: item.severity ?? undefined,
          proposedState: 'ai_observation',
          facts: Object.entries(item.attributes).map(([key, value]) => ({ key, value, confidence: item.confidence })),
          corroboratingSources,
          temporalAgreement,
          hasContradiction,
        }) : undefined
        policyEvaluations.push({
          canonicalLabel: item.canonical_label,
          matchedRuleId: rule?.id,
          ...(evaluation ?? { decision: 'unmatched', adjustedConfidence: item.confidence }),
        })
        if (evaluation?.decision === 'suppress') continue
        const observation = await this.createObservation({
          sceneId: latest.sceneId, lensId: input.lensId, label: item.label, canonicalLabel: item.canonical_label,
          description: item.description, condition: item.condition ?? undefined, severity: item.severity ?? undefined,
          confidence: evaluation?.adjustedConfidence ?? item.confidence,
          requiresReview: item.requires_review || evaluation?.requiresReview === true,
          ...(evaluation && rule ? { policy: {
            ruleId: rule.id,
            profile: input.policyProfile,
            temporalMode: input.temporalMode,
            decision: evaluation.decision,
            modelConfidence: item.confidence,
            adjustedConfidence: evaluation.adjustedConfidence,
            corroboratingSources,
            temporalAgreement,
            hasContradiction,
            reviewReasons: evaluation.reviewReasons,
            missingRequiredFields: evaluation.missingRequiredFields,
            appliedAdjustments: evaluation.appliedAdjustments,
            evaluatedAt: now(),
          } } : {}),
          evidence: [{ assetId: latest.id, ...(item.region ? { region: item.region } : {}) }],
          attributes: item.attributes, sourceModel: analysis.model, sourceAnalysisId: analysis.id, capturedAt: latest.capturedAt,
        })
        created.push(observation.id)
      }
      await context.progress(82, 'Linking entities and rebuilding changes')
      await this.rebuildChanges(latest.sceneId)
      await this.database.transaction(draft => {
        const index = draft.analyses.findIndex(item => item.id === analysis.id)
        if (index >= 0) draft.analyses[index] = {
          ...draft.analyses[index], status: 'succeeded',
          rawResponse: { providerResponse: rawResponse, policyProfile: input.policyProfile, temporalMode: input.temporalMode, policyEvaluations },
          observationIds: created,
          startedAt: context.job.startedAt ?? timestamp, completedAt: now(), version: draft.analyses[index].version + 1,
        }
      })
      return { analysisId: analysis.id, observationIds: created, summary: vision.summary }
    })
    return { analysis, job }
  }

  async createScenario(raw: unknown, actorId: string): Promise<{ scenario: ScenarioBranch; jobId: string }> {
    const input: CreateScenarioInput = CreateScenarioSchema.parse(raw)
    const snapshot = this.database.snapshot()
    const source = snapshot.assets.find(item => item.id === input.sourceAssetId && item.sceneId === input.sceneId)
    if (!source) throw new ValidationError('Scenario source asset does not belong to the selected scene')
    if (source.origin !== 'original') throw new ValidationError('Scenario branches must start from preserved original evidence')
    const scenario: ScenarioBranch = {
      id: createId('scenario'), ...input, status: 'queued', createdBy: actorId, createdAt: now(), version: 1,
    }
    await this.database.transaction(draft => { draft.scenarios.push(scenario) })
    const job = await this.jobs.enqueue({
      sceneId: input.sceneId, assetId: input.sourceAssetId, kind: 'scenario', maxAttempts: 2,
      idempotencyKey: sha256(`${source.sha256}:${input.transformation}:${input.prompt}:${JSON.stringify(input.parameters)}`),
      payload: { scenarioId: scenario.id, ...input },
    }, async context => {
      await context.progress(20, 'Validating immutable source')
      const delivery = this.cloudinary.buildScenarioDelivery(source, input.transformation, input.prompt, input.parameters)
      await context.progress(55, delivery.provider === 'cloudinary' ? 'Cloudinary generative transformation prepared' : 'Local scenario adapter preparing preview')
      const output: MediaAsset = {
        ...source,
        id: createId('asset'), origin: 'generated', parentAssetId: source.id,
        sourceFilename: `scenario-${scenario.id}.${source.cloudinary?.format ?? 'png'}`,
        sha256: sha256(`${source.sha256}:${scenario.id}`),
        uploadedAt: now(), observationIds: [], provenanceEventIds: [],
        structuredMetadata: { ...source.structuredMetadata, scenara_origin: 'generated', scenara_scenario_id: scenario.id },
        tags: [...new Set([...source.tags, 'generated-scenario'])], version: 1,
      }
      if (output.cloudinary && delivery.provider === 'cloudinary') {
        output.cloudinary = { ...output.cloudinary, secureUrl: delivery.url }
        output.posterUrl = delivery.url
        delete output.localUrl
      }
      await this.database.transaction(draft => {
        const scene = draft.scenes.find(item => item.id === input.sceneId)!
        const scenarioIndex = draft.scenarios.findIndex(item => item.id === scenario.id)
        const event = appendProvenance(draft.provenance, {
          sceneId: scene.id, assetId: output.id, action: 'generated', actorType: 'system', actorId: 'scenara-scenario-engine',
          inputFingerprint: assetFingerprint(source), outputFingerprint: assetFingerprint(output),
          parameters: {
            scenarioId: scenario.id,
            transformation: input.transformation,
            cloudinaryTransformation: delivery.transformation,
            prompt: input.prompt,
            generated: true,
            visiblyWatermarked: delivery.provider === 'cloudinary',
          },
          providerReference: source.cloudinary?.assetId,
        })
        output.provenanceEventIds.push(event.id)
        draft.provenance.push(event)
        draft.assets.push(output)
        scene.assetIds.push(output.id)
        draft.scenarios[scenarioIndex] = { ...draft.scenarios[scenarioIndex], outputAssetId: output.id, status: 'succeeded', completedAt: now(), version: 2 }
      })
      await context.progress(100, 'Scenario ready', { outputAssetId: output.id })
      return { scenarioId: scenario.id, outputAssetId: output.id, deliveryUrl: delivery.url, provider: delivery.provider }
    })
    return { scenario, jobId: job.id }
  }

  jobsForScene(sceneId: string) {
    return this.database.snapshot().jobs.filter(item => item.sceneId === sceneId).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  }

  getJob(jobId: string) {
    const job = this.database.snapshot().jobs.find(item => item.id === jobId)
    if (!job) throw new NotFoundError('Job', jobId)
    return job
  }

  private sceneSummary(scene: Scene, snapshot: ReturnType<DatabaseStore['snapshot']>) {
    const assets = snapshot.assets.filter(item => item.sceneId === scene.id)
    const observations = snapshot.observations.filter(item => item.sceneId === scene.id)
    const changes = snapshot.changes.filter(item => item.sceneId === scene.id)
    return {
      ...scene,
      assetCount: assets.length,
      entityCount: scene.entityIds.length,
      observationCount: observations.length,
      changeCount: changes.length,
      reviewCount: observations.filter(item => item.requiresReview && item.state !== 'dismissed').length,
      coverUrl: assets.find(item => item.id === scene.coverAssetId)?.cloudinary?.secureUrl ?? assets.find(item => item.id === scene.coverAssetId)?.localUrl,
    }
  }

  private uniqueSceneSlug(title: string, scenes: Scene[]): string {
    const base = title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'scene'
    let slug = base
    let index = 2
    while (scenes.some(item => item.slug === slug)) slug = `${base}-${index++}`
    return slug
  }

  private observationsContradict(
    historical: Observation,
    proposedCondition: string | null,
    proposedAttributes: Record<string, string | number | boolean | string[] | null>,
  ): boolean {
    for (const [key, value] of Object.entries(proposedAttributes)) {
      const previous = historical.attributes[key]
      if (typeof value === 'boolean' && typeof previous === 'boolean' && value !== previous) return true
    }
    if (!historical.condition || !proposedCondition) return false
    const previous = historical.condition.toLowerCase()
    const next = proposedCondition.toLowerCase()
    const opposites: Array<[string, string]> = [
      ['clear', 'blocked'], ['clear', 'obstruct'], ['open', 'closed'], ['present', 'missing'],
      ['intact', 'damaged'], ['stable', 'unstable'], ['dry', 'wet'], ['active', 'inactive'],
    ]
    return opposites.some(([left, right]) =>
      (previous.includes(left) && next.includes(right)) || (previous.includes(right) && next.includes(left)),
    )
  }

  private localVisionFixture(asset: MediaAsset, lensId: Observation['lensId']): VisionAnalysis {
    const general: VisionAnalysis = {
      scene_type: 'urban_street_inspection',
      summary: 'Urban street corner with pedestrian infrastructure, planted stormwater feature, utilities, vehicles, and a temporary barrier.',
      capture_quality: { usable: true, issues: [] as string[] },
      warnings: ['Local adapter result. Configure Cloudinary credentials for live AI Vision analysis.'],
      observations: [
        { label: 'Temporary curb barrier', canonical_label: 'temporary_barrier', description: 'An orange barrier partially narrows the sidewalk near the curb.', condition: 'partial obstruction', severity: 'medium', confidence: .94, requires_review: true, region: { x: .39, y: .43, width: .14, height: .14 }, attributes: { color: 'orange', material: 'plastic' } },
        { label: 'Utility pole', canonical_label: 'utility_pole', description: 'A wooden utility pole with overhead cables is visible at the corner.', condition: 'stable', severity: 'none', confidence: .97, requires_review: false, region: { x: .84, y: .02, width: .12, height: .85 }, attributes: { material: 'wood' } },
      ],
    }
    const byLens: Partial<Record<Observation['lensId'], VisionAnalysis>> = {
      accessibility: { ...general, observations: [
        { label: 'Tactile curb ramp', canonical_label: 'curb_ramp', description: 'Yellow tactile paving and a continuous curb ramp are visible.', condition: 'clear', severity: 'none', confidence: .96, requires_review: false, region: { x: .55, y: .72, width: .16, height: .14 }, attributes: { tactile_paving: true, obstruction: false } },
      ] },
      environment: { ...general, observations: [
        { label: 'Curbside rain garden', canonical_label: 'rain_garden', description: 'A planted curbside basin has dense vegetation with no visible standing water.', condition: 'healthy', severity: 'none', confidence: .91, requires_review: false, region: { x: .58, y: .48, width: .26, height: .24 }, attributes: { standing_water: false, vegetation_coverage_percent: 70 } },
      ] },
      safety: { ...general, observations: [
        { label: 'Marked crosswalk', canonical_label: 'crosswalk', description: 'The crosswalk is visible with moderate paint wear.', condition: 'moderate wear', severity: 'low', confidence: .87, requires_review: true, region: { x: .08, y: .72, width: .52, height: .25 }, attributes: { paint_visibility_percent: 69 } },
      ] },
    }
    return byLens[lensId] ?? general
  }
}
