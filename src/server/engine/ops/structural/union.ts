import type { ExecContext, OpResult } from '../../types'
import type { DocSet } from '../../docset'

// Note: multi-input resolution happens in the executor. This op just ensures the
// merged DocSet is returned (no additional work needed here).
export async function unionSets(docSet: DocSet, _args: Record<string, any>, _ctx: ExecContext): Promise<OpResult> {
  return {
    docSet,
    meta: {
      duration_ms: 0,
      cost_usd: 0,
      result_count: docSet.docs.length,
      detail: {}
    }
  }
}

