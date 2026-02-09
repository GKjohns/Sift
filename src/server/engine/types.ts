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

export interface Labels {
  tone?: { value: ToneLabel; confidence: number; rationale?: string; key_phrases?: string[]; spans?: Span[] }
  topic?: { value: string; confidence: number; spans?: Span[] }
  commitment?: { value: string; confidence: number; spans?: Span[] }
  violation?: { value: string; confidence: number; spans?: Span[] }
  [custom: string]: { value: any; confidence: number; spans?: Span[]; [key: string]: any } | undefined
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

export interface ExecutionResult {
  finalDocSet: import('./docset').DocSet
  trace: StepTrace[]
  totalCost: number
  stoppedEarly: boolean
  error?: StepError
}

