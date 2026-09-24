import { z } from 'zod'
import type { LensId } from '../../shared/domain.js'

export const VisionRegionSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
})

export const VisionObservationSchema = z.object({
  label: z.string().min(1).max(160),
  canonical_label: z.string().min(1).max(160),
  description: z.string().min(1).max(4_000),
  condition: z.string().max(160).nullable(),
  severity: z.enum(['none', 'low', 'medium', 'high', 'critical']).nullable(),
  confidence: z.number().min(0).max(1),
  requires_review: z.boolean(),
  region: VisionRegionSchema.nullable(),
  attributes: z.record(z.string(), z.union([
    z.string(), z.number(), z.boolean(), z.array(z.string()), z.null(),
  ])),
})

export const VisionAnalysisSchema = z.object({
  scene_type: z.string().min(1).max(160),
  summary: z.string().min(1).max(4_000),
  capture_quality: z.object({
    usable: z.boolean(),
    issues: z.array(z.string().max(500)).max(20),
  }),
  observations: z.array(VisionObservationSchema).max(80),
  warnings: z.array(z.string().max(1_000)).max(40),
})

export type VisionAnalysis = z.infer<typeof VisionAnalysisSchema>
export type VisionObservation = z.infer<typeof VisionObservationSchema>

const schemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['scene_type', 'summary', 'capture_quality', 'observations', 'warnings'],
  properties: {
    scene_type: { type: 'string', description: 'Concise category for the real-world scene.' },
    summary: { type: 'string', description: 'Factual description limited to visible evidence.' },
    capture_quality: {
      type: 'object',
      additionalProperties: false,
      required: ['usable', 'issues'],
      properties: {
        usable: { type: 'boolean' },
        issues: { type: 'array', items: { type: 'string' }, maxItems: 20 },
      },
    },
    observations: {
      type: 'array',
      maxItems: 80,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'label', 'canonical_label', 'description', 'condition', 'severity',
          'confidence', 'requires_review', 'region', 'attributes',
        ],
        properties: {
          label: { type: 'string', description: 'Short human-readable finding.' },
          canonical_label: { type: 'string', description: 'Stable lowercase entity or finding category.' },
          description: { type: 'string', description: 'Factual visible observation without speculation.' },
          condition: { type: ['string', 'null'] },
          severity: { type: ['string', 'null'], enum: ['none', 'low', 'medium', 'high', 'critical', null] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          requires_review: { type: 'boolean' },
          region: {
            anyOf: [
              { type: 'null' },
              {
                type: 'object',
                additionalProperties: false,
                required: ['x', 'y', 'width', 'height'],
                properties: {
                  x: { type: 'number', minimum: 0, maximum: 1 },
                  y: { type: 'number', minimum: 0, maximum: 1 },
                  width: { type: 'number', exclusiveMinimum: 0, maximum: 1 },
                  height: { type: 'number', exclusiveMinimum: 0, maximum: 1 },
                },
              },
            ],
          },
          attributes: {
            type: 'object',
            description: 'Lens-specific primitive values only.',
            additionalProperties: true,
          },
        },
      },
    },
    warnings: { type: 'array', items: { type: 'string' }, maxItems: 40 },
  },
}

const lensInstructions: Record<LensId, string> = {
  general: 'Identify stable physical entities, visible conditions, activities, and notable changes or obstructions.',
  safety: 'Inspect visible hazards, access conflicts, protective equipment, barriers, damaged surfaces, and exposure risks. Do not infer code violations.',
  accessibility: 'Inspect ramps, curb cuts, tactile paving, handrails, entrances, path width, surface continuity, and visible obstructions. Do not certify compliance.',
  environment: 'Inspect vegetation, shade, standing water, visible waste, erosion, surface permeability, and pollution indicators. Do not infer invisible contamination.',
  inventory: 'Identify countable equipment, materials, fixtures, signage, and vehicles with conservative counts.',
  custom: 'Follow the configured workspace lens while remaining strictly grounded in visible evidence.',
}

export function buildVisionPrompt(lensId: LensId, policyContext = ''): string {
  return [
    'You are the visual observation stage of Scenara, an evidence intelligence system.',
    'Analyze only what is visibly supported by this media. Separate observation from inference.',
    'Use normalized coordinates for regions, where x/y are the upper-left corner and values range from 0 to 1.',
    'Prefer a smaller set of high-quality, stable observations over speculative detail.',
    'Set requires_review to true for ambiguity, uncertain severity, safety implications, or confidence below 0.8.',
    `Active lens: ${lensId}. ${lensInstructions[lensId]}`,
    policyContext,
    'Return JSON matching this schema exactly:',
    '```json',
    JSON.stringify(schemaObject, null, 2),
    '```',
  ].join('\n')
}

export function parseVisionResponse(value: string): VisionAnalysis {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch (error) {
    throw new Error(`AI Vision returned non-JSON structured output: ${(error as Error).message}`)
  }
  return VisionAnalysisSchema.parse(parsed)
}
