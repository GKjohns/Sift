import type { AuditEntry, ExecContext, Labels, OpResult } from '../../types'
import { DocSet } from '../../docset'

export async function topK(docSet: DocSet, args: Record<string, any>, _ctx: ExecContext): Promise<OpResult> {
  const k = Math.max(0, Number(args?.k ?? 0))
  const by = (args?.by ?? 'timestamp') as 'timestamp' | 'word_count' | 'relevance'
  const order = (args?.order ?? 'desc') as 'asc' | 'desc'

  const docs = [...docSet.docs]

  if (by === 'timestamp') {
    docs.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  } else if (by === 'word_count') {
    docs.sort((a, b) => a.metadata.word_count - b.metadata.word_count)
  } else {
    // relevance = current order, so no sort
  }

  // For relevance, "desc" means keep current order (most relevant first).
  if (by === 'relevance') {
    if (order === 'asc') docs.reverse()
  } else {
    if (order === 'desc') docs.reverse()
  }

  const kept = docs.slice(0, k)
  const keepIds = new Set(kept.map(d => d.id))
  const nextLabels = new Map<string, Labels>()
  for (const [docId, labels] of docSet.labels) {
    if (keepIds.has(docId)) nextLabels.set(docId, labels)
  }
  const next = new DocSet({ docs: kept, labels: nextLabels, audit: [...(docSet.audit as AuditEntry[])] })

  return {
    docSet: next,
    meta: {
      duration_ms: 0,
      cost_usd: 0,
      result_count: next.docs.length,
      detail: { k, by, order }
    }
  }
}

