import type { ExecContext, OpResult } from '../../types'
import type { DocSet } from '../../docset'

// Note: true intersection across multiple sets is handled in the executor's
// multi-input resolution when op === "intersect".
export async function intersectSets(docSet: DocSet, _args: Record<string, any>, _ctx: ExecContext): Promise<OpResult> {
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

