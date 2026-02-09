import type { PlanStep } from '../../engine/types'
import { Budget } from '../../engine/types'
import { executePlan } from '../../engine/executor'
import { generateDocuments } from '../../utils/fake-data'

const DEFAULT_PLAN: PlanStep[] = [
  { op: 'filter_metadata', args: { after: '2025-01-01' } },
  { op: 'search_lex', args: { terms: ['schedule', 'pickup', 'weekend', 'custody'], mode: 'any' } },
  { op: 'top_k', args: { k: 20, by: 'timestamp', order: 'desc' } },
  { op: 'count', args: { by: 'sender' } }
]

const BRANCHING_PLAN: PlanStep[] = [
  {
    id: 'lex',
    op: 'search_lex',
    args: { terms: ['schedule', 'pickup', 'weekend', 'custody'], mode: 'any' }
  },
  {
    id: 'regex',
    op: 'search_regex',
    input: 'corpus',
    args: { pattern: '\\b(schedule|pickup|weekend|custody)\\b', flags: 'gi' }
  },
  { op: 'union', input: ['lex', 'regex'], args: {} },
  { op: 'count', args: { by: 'thread' } }
]

export default defineEventHandler(async (event) => {
  const body = await readBody<{ plan?: PlanStep[]; example?: 'default' | 'branching'; budget?: number }>(event)

  const docs = generateDocuments()
  const budgetLimit = Number.isFinite(body?.budget) ? Number(body.budget) : 1.0

  const plan =
    body?.example === 'branching'
      ? BRANCHING_PLAN
      : (Array.isArray(body?.plan) && body.plan.length > 0)
          ? body.plan
          : DEFAULT_PLAN

  const ctx = {
    corpus: docs,
    budget: new Budget(budgetLimit),
    trace: []
  }

  const result = await executePlan(plan, ctx)

  return {
    corpus_size: docs.length,
    budget_limit_usd: budgetLimit,
    stopped_early: result.stoppedEarly,
    error: result.error ?? null,
    total_cost: result.totalCost,
    final_count: result.finalDocSet.docs.length,
    final_doc_ids: result.finalDocSet.docs.map(d => d.id),
    trace: result.trace,
    audit: result.finalDocSet.audit
  }
})

