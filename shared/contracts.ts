import { z } from 'zod'

export const IdSchema = z.string().min(3).max(160)
export const ISODateSchema = z.string().datetime({ offset: true })
export const LensSchema = z.enum(['general', 'safety', 'accessibility', 'environment', 'inventory', 'custom'])
export const ObservationStateSchema = z.enum(['ai_observation', 'review', 'verified', 'dismissed'])

export const BoundingBoxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
}).refine(box => box.x + box.width <= 1.001 && box.y + box.height <= 1.001, {
  message: 'Bounding box must fit within normalized media coordinates',
})

export const ObservationEvidenceSchema = z.object({
  assetId: IdSchema,
  region: BoundingBoxSchema.optional(),
  frameTimeSeconds: z.number().nonnegative().optional(),
  transcriptSegmentId: IdSchema.optional(),
  cropUrl: z.string().url().optional(),
  note: z.string().max(2_000).optional(),
})

const SceneFieldsSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2_000).default(''),
  locationLabel: z.string().trim().min(2).max(240),
  captureStart: ISODateSchema,
  captureEnd: ISODateSchema,
  tags: z.array(z.string().trim().min(1).max(60)).max(40).default([]),
  activeLensIds: z.array(LensSchema).min(1).max(6).default(['general']),
})

export const CreateSceneSchema = SceneFieldsSchema.refine(value => Date.parse(value.captureEnd) >= Date.parse(value.captureStart), {
  message: 'Capture end must not be earlier than capture start',
  path: ['captureEnd'],
})

export const UpdateSceneSchema = SceneFieldsSchema.partial().extend({
  expectedVersion: z.number().int().positive(),
}).refine(value => !value.captureStart || !value.captureEnd || Date.parse(value.captureEnd) >= Date.parse(value.captureStart), {
  message: 'Capture end must not be earlier than capture start',
  path: ['captureEnd'],
})

export const RegisterAssetSchema = z.object({
  sceneId: IdSchema,
  kind: z.enum(['image', 'video', 'audio', 'document']),
  sourceFilename: z.string().trim().min(1).max(512),
  mimeType: z.string().trim().min(3).max(160),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  byteLength: z.number().int().nonnegative(),
  capturedAt: ISODateSchema,
  localUrl: z.string().max(2_000).optional(),
  cloudinary: z.object({
    assetId: z.string(),
    publicId: z.string(),
    version: z.number().int(),
    resourceType: z.enum(['image', 'video', 'raw']),
    deliveryType: z.string(),
    secureUrl: z.string().url(),
    format: z.string(),
    bytes: z.number().int().nonnegative(),
    etag: z.string().optional(),
  }).optional(),
  dimensions: z.object({
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    durationSeconds: z.number().positive().optional(),
    frameRate: z.number().positive().optional(),
    sampleRate: z.number().positive().optional(),
    channels: z.number().int().positive().optional(),
  }).default({}),
  tags: z.array(z.string().max(60)).max(100).default([]),
})

export const CreateObservationSchema = z.object({
  sceneId: IdSchema,
  entityId: IdSchema.optional(),
  lensId: LensSchema,
  label: z.string().trim().min(1).max(160),
  canonicalLabel: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(4_000),
  condition: z.string().trim().max(160).optional(),
  severity: z.enum(['none', 'low', 'medium', 'high', 'critical']).optional(),
  confidence: z.number().min(0).max(1),
  requiresReview: z.boolean().default(false),
  evidence: z.array(ObservationEvidenceSchema).min(1).max(100),
  attributes: z.record(z.string(), z.union([
    z.string(), z.number(), z.boolean(), z.array(z.string()), z.null(),
  ])).default({}),
  sourceModel: z.string().trim().min(1).max(160),
  sourceAnalysisId: IdSchema.optional(),
  capturedAt: ISODateSchema,
})

export const ReviewObservationSchema = z.object({
  decision: z.enum(['verified', 'corrected', 'dismissed', 'deferred']),
  expectedVersion: z.number().int().positive(),
  rationale: z.string().trim().max(4_000).optional(),
  correction: z.object({
    label: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().min(1).max(4_000).optional(),
    condition: z.string().trim().max(160).optional(),
    severity: z.enum(['none', 'low', 'medium', 'high', 'critical']).optional(),
    attributes: z.record(z.string(), z.union([
      z.string(), z.number(), z.boolean(), z.array(z.string()), z.null(),
    ])).optional(),
  }).optional(),
}).superRefine((value, context) => {
  if (value.decision === 'corrected' && !value.correction) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'A correction payload is required', path: ['correction'] })
  }
})

export const SearchRequestSchema = z.object({
  text: z.string().trim().max(1_000).default(''),
  sceneIds: z.array(IdSchema).max(100).optional(),
  lensIds: z.array(LensSchema).max(6).optional(),
  states: z.array(ObservationStateSchema).max(4).optional(),
  assetKinds: z.array(z.enum(['image', 'video', 'audio', 'document'])).max(4).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  capturedAfter: ISODateSchema.optional(),
  capturedBefore: ISODateSchema.optional(),
  tags: z.array(z.string().max(60)).max(40).optional(),
  limit: z.number().int().min(1).max(100).default(30),
  cursor: z.string().max(500).optional(),
})

export const CreateScenarioSchema = z.object({
  sceneId: IdSchema,
  sourceAssetId: IdSchema,
  title: z.string().trim().min(2).max(160),
  prompt: z.string().trim().min(4).max(4_000),
  transformation: z.enum(['remove', 'replace', 'recolor', 'fill', 'restore', 'background_replace']),
  parameters: z.record(z.string(), z.unknown()).default({}),
})

export const UploadSignatureSchema = z.object({
  sceneId: IdSchema,
  resourceType: z.enum(['image', 'video', 'raw']),
  filename: z.string().trim().min(1).max(512),
  eager: z.array(z.string().max(500)).max(10).optional(),
  context: z.record(z.string(), z.string().max(500)).optional(),
})

export const AnalyzeAssetSchema = z.object({
  assetId: IdSchema,
  lensId: LensSchema,
  force: z.boolean().default(false),
  async: z.boolean().default(true),
})
