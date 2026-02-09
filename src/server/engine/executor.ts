import { performance } from 'node:perf_hooks'

import { BudgetExceededError, PlanError } from './errors'
import { DocSet } from './docset'
import { registry } from './registry'
import type { ExecContext, ExecutionResult, OpResult, PlanStep, StepError, StepTrace } from './types'

function stepKey(step: PlanStep, index: number): string {
  return step.id ?? `_step_${index}`
}

function toStepError(err: any): StepError {
  if (!err) return { name: 'Error', message: 'Unknown error' }
  return {
    name: String(err.name ?? 'Error'),
    message: String(err.message ?? err),
    code: typeof err.code === 'string' ? err.code : undefined,
    detail: err.detail ?? (err.stack ? { stack: String(err.stack) } : undefined)
  }
}

function appendTrace(ctx: ExecContext, trace: StepTrace): void {
  ctx.trace.push(trace)
}

export async function executePlan(plan: PlanStep[], ctx: ExecContext): Promise<ExecutionResult> {
  const outputs = new Map<string, OpResult>()
  let prevKey: string | null = null
  let stoppedEarly = false
  let topLevelError: StepError | undefined

  const safePlan = Array.isArray(plan) ? plan : []

  for (let i = 0; i < safePlan.length; i++) {
    const step = safePlan[i]!
    const key = stepKey(step, i)

    // ── Resolve input ──
    let inputDocSet: DocSet
    try {
      if (!step.input) {
        inputDocSet = prevKey ? outputs.get(prevKey)!.docSet : DocSet.fromCorpus(ctx.corpus)
      } else if (step.input === 'corpus') {
        inputDocSet = DocSet.fromCorpus(ctx.corpus)
      } else if (Array.isArray(step.input)) {
        const sets = step.input.map((ref) => {
          const out = outputs.get(ref)
          if (!out) throw new PlanError(`Step "${key}" references "${ref}" which hasn't executed yet`, { code: 'FORWARD_REFERENCE', stepId: key, stepIndex: i, detail: { ref } })
          return out.docSet
        })
        inputDocSet = (step.op === 'intersect') ? DocSet.intersect(...sets) : DocSet.union(...sets)
      } else {
        const out = outputs.get(step.input)
        if (!out) throw new PlanError(`Step "${key}" references "${step.input}" which doesn't exist`, { code: 'MISSING_REFERENCE', stepId: key, stepIndex: i, detail: { ref: step.input } })
        inputDocSet = out.docSet
      }
    } catch (err: any) {
      const planErr = err instanceof PlanError ? err : new PlanError(String(err?.message ?? err), { code: 'INVALID_INPUT', stepId: key, stepIndex: i })
      const stepError = toStepError(planErr)

      appendTrace(ctx, {
        step,
        input_count: 0,
        output_count: 0,
        duration_ms: 0,
        cost_usd: 0,
        status: 'error',
        detail: { phase: 'input_resolution' },
        error: stepError
      })

      stoppedEarly = true
      topLevelError = stepError
      break
    }

    const fn = registry[step.op]
    if (!fn) {
      const planErr = new PlanError(`Unknown operation: "${step.op}"`, { code: 'UNKNOWN_OP', stepId: key, stepIndex: i, detail: { op: step.op } })
      const stepError = toStepError(planErr)

      appendTrace(ctx, {
        step,
        input_count: inputDocSet.docs.length,
        output_count: inputDocSet.docs.length,
        duration_ms: 0,
        cost_usd: 0,
        status: 'error',
        detail: { phase: 'dispatch' },
        error: stepError
      })

      stoppedEarly = true
      topLevelError = stepError
      break
    }

    // ── Dispatch ──
    const t0 = performance.now()
    try {
      const result = await fn(inputDocSet, step.args ?? {}, ctx)
      const duration_ms = Math.round((performance.now() - t0) * 1000) / 1000

      ctx.budget.add(result.meta.cost_usd ?? 0)

      const audited = result.docSet.withAudit({
        op: step.op,
        args: step.args ?? {},
        timestamp: new Date().toISOString(),
        input_count: inputDocSet.docs.length,
        output_count: result.docSet.docs.length,
        duration_ms,
        cost_usd: result.meta.cost_usd ?? 0
      })

      const finalResult: OpResult = {
        docSet: audited,
        meta: {
          ...result.meta,
          duration_ms,
          result_count: audited.docs.length
        }
      }

      appendTrace(ctx, {
        step,
        input_count: inputDocSet.docs.length,
        output_count: audited.docs.length,
        duration_ms,
        cost_usd: finalResult.meta.cost_usd ?? 0,
        status: 'complete',
        detail: finalResult.meta.detail
      })

      outputs.set(key, finalResult)
      prevKey = key
    } catch (err: any) {
      const duration_ms = Math.round((performance.now() - t0) * 1000) / 1000
      const isBudget = err instanceof BudgetExceededError || err?.name === 'BudgetExceededError'
      const stepError = toStepError(err)

      appendTrace(ctx, {
        step,
        input_count: inputDocSet.docs.length,
        output_count: inputDocSet.docs.length,
        duration_ms,
        cost_usd: 0,
        status: 'error',
        detail: { phase: 'execution' },
        error: stepError
      })

      if (isBudget) {
        stoppedEarly = true
        topLevelError = stepError
        // Keep prevKey as-is so the current "final" is last successful step.
        break
      }

      // Non-fatal step failure: continue with input DocSet unchanged
      const passthrough: OpResult = {
        docSet: inputDocSet.withAudit({
          op: step.op,
          args: step.args ?? {},
          timestamp: new Date().toISOString(),
          input_count: inputDocSet.docs.length,
          output_count: inputDocSet.docs.length,
          duration_ms,
          cost_usd: 0
        }),
        meta: { duration_ms, cost_usd: 0, result_count: inputDocSet.docs.length, detail: { skipped: true, error: stepError } }
      }
      outputs.set(key, passthrough)
      prevKey = key
    }
  }

  const finalDocSet = prevKey ? outputs.get(prevKey)!.docSet : DocSet.fromCorpus(ctx.corpus)

  return {
    finalDocSet,
    trace: ctx.trace,
    totalCost: ctx.budget.spent_usd,
    stoppedEarly,
    error: topLevelError
  }
}

