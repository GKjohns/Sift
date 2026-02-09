import type { AuditEntry, ExecContext, Labels, OpResult } from '../../types'
import { DocSet } from '../../docset'

export async function getContext(docSet: DocSet, args: Record<string, any>, ctx: ExecContext): Promise<OpResult> {
  const docId = String(args?.doc_id ?? '')
  const window = Math.max(0, Number(args?.window ?? 3))

  const target = ctx.corpus.find(d => d.id === docId)
  if (!target) {
    throw new Error(`get_context: doc_id "${docId}" not found in corpus`)
  }

  const threadKey = target.metadata.thread_id || target.id
  const threadDocs = ctx.corpus
    .filter(d => (d.metadata.thread_id || d.id) === threadKey)
    .slice()
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  const idx = threadDocs.findIndex(d => d.id === docId)
  if (idx === -1) {
    throw new Error(`get_context: doc_id "${docId}" not found in thread`)
  }

  const start = Math.max(0, idx - window)
  const end = Math.min(threadDocs.length, idx + window + 1)
  const picked = threadDocs.slice(start, end)

  // Carry over labels if they exist on the incoming set.
  const keepIds = new Set(picked.map(d => d.id))
  const nextLabels = new Map<string, Labels>()
  for (const [id, labels] of docSet.labels) {
    if (keepIds.has(id)) nextLabels.set(id, labels)
  }

  const next = new DocSet({ docs: picked, labels: nextLabels, audit: [...(docSet.audit as AuditEntry[])] })

  return {
    docSet: next,
    meta: {
      duration_ms: 0,
      cost_usd: 0,
      result_count: next.docs.length,
      detail: { thread_id: threadKey, window, doc_id: docId }
    }
  }
}

