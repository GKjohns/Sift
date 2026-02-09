export type PlanErrorCode =
  | 'UNKNOWN_OP'
  | 'MISSING_REFERENCE'
  | 'FORWARD_REFERENCE'
  | 'INVALID_INPUT'
  | 'MALFORMED_PLAN'

export class PlanError extends Error {
  code: PlanErrorCode
  stepId?: string
  stepIndex?: number
  detail?: any

  constructor(message: string, opts: { code: PlanErrorCode; stepId?: string; stepIndex?: number; detail?: any }) {
    super(message)
    this.name = 'PlanError'
    this.code = opts.code
    this.stepId = opts.stepId
    this.stepIndex = opts.stepIndex
    this.detail = opts.detail
  }
}

export class BudgetExceededError extends Error {
  limit_usd: number
  spent_usd: number
  estimated_usd: number

  constructor(message: string, opts: { limit_usd: number; spent_usd: number; estimated_usd: number }) {
    super(message)
    this.name = 'BudgetExceededError'
    this.limit_usd = opts.limit_usd
    this.spent_usd = opts.spent_usd
    this.estimated_usd = opts.estimated_usd
  }
}

