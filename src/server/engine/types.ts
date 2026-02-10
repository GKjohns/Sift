import type { SiftDocument, ToneLabel } from '~/types'
import { BudgetExceededError } from './errors'

// ── Planning ──────────────────────────────────────────────────────────────────

export interface PlanStep {
  op: string
  args: Record<string, any>
  id?: string
  input?: string | string[]
  rationale?: string
  estimated_cost?: number
}

// ── Labels ────────────────────────────────────────────────────────────────────

export interface Span {
  start: number
  end: number
  text?: string
}

export interface ThreadLabelMeta {
  unit: 'thread'
  thread_id: string
  cited_messages: string[]
}

export interface Labels {
  tone?: { value: ToneLabel; confidence: number; rationale?: string; key_phrases?: string[]; spans?: Span[]; thread_meta?: ThreadLabelMeta }
  topic?: { value: string; confidence: number; rationale?: string; secondary_topics?: string[]; spans?: Span[]; thread_meta?: ThreadLabelMeta }
  commitment?: { value: string; confidence: number; rationale?: string; spans?: Span[]; thread_meta?: ThreadLabelMeta }
  violation?: { value: string; confidence: number; rationale?: string; spans?: Span[]; thread_meta?: ThreadLabelMeta }
  [custom: string]: { value: any; confidence: number; rationale?: string; spans?: Span[]; thread_meta?: ThreadLabelMeta; [key: string]: any } | undefined
}

// ── Audit / Trace ─────────────────────────────────────────────────────────────

export interface AuditEntry {
  op: string
  args: Record<string, any>
  timestamp: string
  input_count: number
  output_count: number
  duration_ms: number
  cost_usd: number
}

export interface StepError {
  name: string
  message: string
  code?: string
  detail?: any
}

export interface StepTrace {
  step: PlanStep
  input_count: number
  output_count: number
  duration_ms: number
  cost_usd: number
  status: 'complete' | 'error'
  detail: any
  error?: StepError
}

// ── Budget / Exec Context ─────────────────────────────────────────────────────

export class Budget {
  limit_usd: number
  spent_usd: number

  constructor(limit_usd: number) {
    this.limit_usd = limit_usd
    this.spent_usd = 0
  }

  check(estimated_usd: number): void {
    if (this.spent_usd + estimated_usd > this.limit_usd) {
      throw new BudgetExceededError(
        `Budget exceeded (limit $${this.limit_usd}, spent $${this.spent_usd}, need $${estimated_usd})`,
        { limit_usd: this.limit_usd, spent_usd: this.spent_usd, estimated_usd }
      )
    }
  }

  add(cost_usd: number): void {
    this.spent_usd += cost_usd
  }
}

export interface ExecContext {
  corpus: SiftDocument[]
  budget: Budget
  trace: StepTrace[]
  // Placeholder for Sprint 2+ operations
  openai?: any
}

// ── Operations ────────────────────────────────────────────────────────────────

export interface OpResult {
  docSet: import('./docset').DocSet
  meta: {
    duration_ms: number
    cost_usd: number
    result_count: number
    detail: any
  }
}

export type OpFn = (docSet: import('./docset').DocSet, args: Record<string, any>, ctx: ExecContext) => Promise<OpResult>

// ── Token Pricing ────────────────────────────────────────────────────────────

/** Per-token pricing (USD per token) by model */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-5-nano': { input: 0.10 / 1_000_000, output: 0.40 / 1_000_000 },
  'gpt-5-mini': { input: 0.40 / 1_000_000, output: 1.60 / 1_000_000 }
}

/** Compute estimated USD cost from token usage */
export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model]
  if (!pricing) return 0
  return pricing.input * inputTokens + pricing.output * outputTokens
}

export interface ExecutionResult {
  finalDocSet: import('./docset').DocSet
  trace: StepTrace[]
  totalCost: number
  stoppedEarly: boolean
  error?: StepError
}

// ── Planner ──────────────────────────────────────────────────────────────────

export interface CorpusSummary {
  total_documents: number
  senders: { name: string; count: number }[]
  date_range: { start: string; end: string }
  has_tone_analysis: boolean
  thread_count: number
  topics?: string[]
}

export interface PlannerResult {
  query_interpretation: string
  steps: PlanStep[]
  total_estimated_cost: number
  reasoning_summary: string
  usage?: { input_tokens: number; output_tokens: number }
}

// ── Synthesizer ──────────────────────────────────────────────────────────────

export interface SynthesisCitation {
  doc_id: string
  message_number?: number
  preview: string
  thread_id?: string
}

export interface SynthesisResult {
  answer: string
  citations: SynthesisCitation[]
  thread_grouped: boolean
  usage?: { input_tokens: number; output_tokens: number }
}

