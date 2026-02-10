import type { ExecutionStep, QueryResult } from '~/types'

import { generateDocuments } from '../../utils/fake-data'
import { generatePlan } from '../../engine/planner'
import { executePlan } from '../../engine/executor'
import { synthesize } from '../../engine/synthesizer'
import { Budget } from '../../engine/types'
import type { StepTrace } from '../../engine/types'
import { opTier } from '../../engine/registry'

// ── Mapping helpers ──────────────────────────────────────────────────────────

function traceToExecutionStep(trace: StepTrace, index: number): ExecutionStep {
  return {
    id: trace.step.id ?? `step-${index + 1}`,
    op: trace.step.op,
    tier: opTier[trace.step.op] ?? 3,
    args: trace.step.args ?? {},
    result_count: trace.status === 'error' ? null : trace.output_count,
    cost: trace.cost_usd,
    duration_ms: trace.duration_ms,
    status: trace.status === 'error' ? 'error' : 'complete'
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default defineEventHandler(async (event) => {
  const body = await readBody<{ query: string; budget?: number }>(event)

  if (!body.query?.trim()) {
    throw createError({ statusCode: 400, message: 'Query is required' })
  }

  const query = body.query.trim()
  const budgetLimit = Number.isFinite(body.budget) ? Number(body.budget) : 1.0

  // Load corpus (fake data for now — real corpus loading is a separate feature)
  const corpus = generateDocuments()

  // ── Step 1: Plan ──────────────────────────────────────────────────────────
  let planResult
  try {
    planResult = await generatePlan(query, corpus)
  } catch (err: any) {
    throw createError({
      statusCode: 502,
      message: 'Planning failed',
      data: { detail: err?.message ?? String(err) }
    })
  }

  if (planResult.steps.length === 0) {
    // Planner returned an empty plan — return a helpful message
    return {
      answer: `The planner could not decompose your query into operations. Interpretation: "${planResult.query_interpretation}". Try rephrasing your question.`,
      citations: [],
      execution_plan: [],
      total_cost: 0,
      documents_touched: corpus.length
    } satisfies QueryResult
  }

  // ── Step 2: Execute ───────────────────────────────────────────────────────
  const ctx = {
    corpus,
    budget: new Budget(budgetLimit),
    trace: [] as StepTrace[]
  }

  const execResult = await executePlan(planResult.steps, ctx)

  // Map trace to UI-friendly execution steps
  const executionPlan: ExecutionStep[] = execResult.trace.map(traceToExecutionStep)

  // ── Step 3: Synthesize ────────────────────────────────────────────────────
  let answer: string
  let citations: QueryResult['citations'] = []

  try {
    const synthesis = await synthesize(
      query,
      execResult.finalDocSet,
      execResult.trace,
      corpus
    )

    answer = synthesis.answer
    citations = synthesis.citations.map(c => ({
      doc_id: c.doc_id,
      message_number: c.message_number,
      preview: c.preview
    }))
  } catch (err: any) {
    // Synthesizer failed — return raw results with fallback answer
    console.error('[query/run] Synthesizer error:', err?.message ?? err)
    const docCount = execResult.finalDocSet.docs.length
    answer = `Synthesis unavailable. Found ${docCount} document${docCount === 1 ? '' : 's'} matching your query.`

    // Build basic citations from the final DocSet
    citations = execResult.finalDocSet.docs.slice(0, 10).map(doc => ({
      doc_id: doc.id,
      message_number: doc.metadata.message_number,
      preview: doc.text.length > 120 ? doc.text.substring(0, 120) + '...' : doc.text
    }))
  }

  // ── Build response ────────────────────────────────────────────────────────
  return {
    answer,
    citations,
    execution_plan: executionPlan,
    total_cost: execResult.totalCost,
    documents_touched: corpus.length
  } satisfies QueryResult
})
