import type { ExecContext, OpResult } from '../../types'
import type { DocSet } from '../../docset'

function lower(s: string | undefined | null): string {
  return (s ?? '').toLowerCase()
}

export async function filterMetadata(docSet: DocSet, args: Record<string, any>, _ctx: ExecContext): Promise<OpResult> {
  const {
    sender,
    recipient,
    after,
    before,
    thread_id,
    min_words,
    max_words
  } = args ?? {}

  const senderL = sender ? lower(String(sender)) : null
  const recipientL = recipient ? lower(String(recipient)) : null
  const threadId = thread_id ? String(thread_id) : null

  const afterTs = after ? Date.parse(String(after)) : null
  const beforeTs = before ? Date.parse(String(before)) : null

  const minWords = Number.isFinite(min_words) ? Number(min_words) : null
  const maxWords = Number.isFinite(max_words) ? Number(max_words) : null

  const filtered = docSet.filter((doc) => {
    if (senderL && lower(doc.metadata.sender) !== senderL) return false
    if (recipientL && lower(doc.metadata.recipient) !== recipientL) return false
    if (threadId && String(doc.metadata.thread_id ?? '') !== threadId) return false

    if (afterTs !== null) {
      const ts = Date.parse(doc.timestamp)
      if (!Number.isFinite(ts) || ts < afterTs) return false
    }

    if (beforeTs !== null) {
      const ts = Date.parse(doc.timestamp)
      if (!Number.isFinite(ts) || ts >= beforeTs) return false
    }

    if (minWords !== null && doc.metadata.word_count < minWords) return false
    if (maxWords !== null && doc.metadata.word_count > maxWords) return false

    return true
  })

  return {
    docSet: filtered,
    meta: {
      duration_ms: 0,
      cost_usd: 0,
      result_count: filtered.docs.length,
      detail: {}
    }
  }
}

