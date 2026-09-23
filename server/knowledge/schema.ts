import { z } from 'zod'

export const KnowledgeQuerySchema=z.object({
  lensId:z.enum(['general','safety','accessibility','environment','custom']).optional(),
  profile:z.enum(['balanced','risk_sensitive','high_precision','rapid_screen']).optional(),
  temporalMode:z.enum(['single_capture','change_detection']).optional(),
  captureContext:z.enum(['streetscape','intersection','sidewalk','park','waterfront','construction','transit','building_edge']).optional(),
  modality:z.enum(['image','video','audio','document']).optional(),
  category:z.string().trim().min(1).max(80).optional(),
  text:z.string().trim().max(240).optional(),
  limit:z.coerce.number().int().min(1).max(200).default(50),
  offset:z.coerce.number().int().min(0).default(0),
})

export const PolicyEvaluationSchema=z.object({
  ruleId:z.string().min(3).max(180),
  modelConfidence:z.number().min(0).max(1),
  proposedSeverity:z.enum(['none','low','medium','high','critical']).optional(),
  proposedState:z.enum(['ai_observation','review','verified','dismissed']).optional(),
  facts:z.array(z.object({
    key:z.string().min(1).max(120),
    value:z.unknown(),
    confidence:z.number().min(0).max(1),
    sourceObservationId:z.string().optional(),
  })).max(100).default([]),
  corroboratingSources:z.number().int().min(0).max(100).default(1),
  temporalAgreement:z.boolean().default(false),
  hasContradiction:z.boolean().default(false),
})
