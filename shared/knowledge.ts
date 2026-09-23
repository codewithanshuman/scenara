import type { LensId, ObservationState } from './domain'

export type ObservationSeverity = 'none' | 'low' | 'medium' | 'high' | 'critical'

export type CaptureContext = 'streetscape' | 'intersection' | 'sidewalk' | 'park' | 'waterfront' | 'construction' | 'transit' | 'building_edge'
export type CaptureModality = 'image' | 'video' | 'audio' | 'document'
export type TemporalMode = 'single_capture' | 'change_detection'
export type PolicyProfile = 'balanced' | 'risk_sensitive' | 'high_precision' | 'rapid_screen'

export interface KnowledgeCatalogMetadata {
  schemaVersion: string
  catalogVersion: string
  title: string
  description: string
  generatedAt: string
  disclaimer: string
  ruleCount: number
  conceptCount: number
  profiles: PolicyProfile[]
  temporalModes: TemporalMode[]
}

export interface ObservationFieldDefinition {
  key: string
  label: string
  type: 'string' | 'number' | 'boolean' | 'enum' | 'string_array'
  required: boolean
  description: string
  enumValues?: string[]
  unit?: string
}

export interface ConfidencePolicy {
  autoAcceptAt: number
  requireReviewBelow: number
  suppressBelow: number
  corroborationBonus: number
  temporalAgreementBonus: number
  contradictionPenalty: number
}

export interface ReviewPolicy {
  alwaysReview: boolean
  reviewWhenSeverityAtLeast: ObservationSeverity
  reviewWhenStateIs: ObservationState[]
  reviewWhenAttributesMissing: string[]
  reviewerQuestions: string[]
  rejectionReasons: string[]
}

export interface TemporalPolicy {
  mode: TemporalMode
  minimumGapSeconds: number
  maximumGapSeconds?: number
  stableAttributes: string[]
  mutableAttributes: string[]
  changeKinds: Array<'appeared' | 'disappeared' | 'modified' | 'moved' | 'unchanged'>
  meaningfulChangeWhen: string[]
}

export interface SeverityBand {
  severity: ObservationSeverity
  when: string
  rationale: string
}

export interface ObservationKnowledgeRule {
  id: string
  conceptId: string
  canonicalLabel: string
  displayLabel: string
  category: string
  lensId: LensId
  profile: PolicyProfile
  temporalMode: TemporalMode
  summary: string
  aliases: string[]
  negativeAliases: string[]
  captureContexts: CaptureContext[]
  modalities: CaptureModality[]
  promptInstructions: string[]
  visualCues: string[]
  exclusionCues: string[]
  fields: ObservationFieldDefinition[]
  confidence: ConfidencePolicy
  review: ReviewPolicy
  temporal: TemporalPolicy
  severityBands: SeverityBand[]
  searchTerms: string[]
  recommendedActions: string[]
  evidenceRequirements: string[]
  provenanceRequirements: string[]
  advisoryNotice: string
}

export interface ObservationKnowledgeCatalog {
  metadata: KnowledgeCatalogMetadata
  rules: ObservationKnowledgeRule[]
}

export interface KnowledgeQuery {
  lensId?: LensId
  profile?: PolicyProfile
  temporalMode?: TemporalMode
  captureContext?: CaptureContext
  modality?: CaptureModality
  category?: string
  text?: string
  limit?: number
  offset?: number
}

export interface KnowledgeQueryResult {
  total: number
  offset: number
  limit: number
  rules: ObservationKnowledgeRule[]
  facets: {
    lenses: Record<string, number>
    profiles: Record<string, number>
    temporalModes: Record<string, number>
    categories: Record<string, number>
    captureContexts: Record<string, number>
  }
}

export interface EvaluationFact {
  key: string
  value: unknown
  confidence: number
  sourceObservationId?: string
}

export interface PolicyEvaluationInput {
  ruleId: string
  modelConfidence: number
  proposedSeverity?: ObservationSeverity
  proposedState?: ObservationState
  facts: EvaluationFact[]
  corroboratingSources: number
  temporalAgreement: boolean
  hasContradiction: boolean
}

export interface PolicyEvaluationResult {
  ruleId: string
  adjustedConfidence: number
  decision: 'accept' | 'review' | 'suppress'
  requiresReview: boolean
  reviewReasons: string[]
  missingRequiredFields: string[]
  severity: ObservationSeverity
  appliedAdjustments: Array<{ kind: string; value: number; explanation: string }>
}
