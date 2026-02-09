import type { SiftDocument } from '~/types'
import type { DocSet } from '../docset'

export interface ThreadGroup {
  thread_id: string
  messages: SiftDocument[] // full thread context from corpus (chronologically ordered)
  docset_message_ids: Set<string> // which of these messages are in the current DocSet
  rendered: string
  token_estimate: number
}

function safeTs(iso: string): number {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY
}

function formatTs(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return iso
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`
}

export function renderThread(group: Omit<ThreadGroup, 'rendered' | 'token_estimate'>): string {
  const header = `THREAD: ${group.thread_id} (${group.messages.length} messages)`
  const sep = '════════════════════════════════'

  const blocks = group.messages.map((m) => {
    const sender = m.metadata.sender || 'Unknown'
    const ts = formatTs(m.timestamp)
    return `[${m.id}] ${sender} — ${ts}\n${m.text}`.trim()
  })

  return `${header}\n${sep}\n\n${blocks.join('\n\n')}\n\n${sep}`
}

export function groupByThread(docSet: DocSet, corpus: SiftDocument[]): ThreadGroup[] {
  const threadIds = new Set<string>()
  const docSetIdsByThread = new Map<string, Set<string>>()

  for (const doc of docSet.docs) {
    const threadId = String(doc.metadata.thread_id ?? `__no_thread__:${doc.id}`)
    threadIds.add(threadId)
    if (!docSetIdsByThread.has(threadId)) docSetIdsByThread.set(threadId, new Set())
    docSetIdsByThread.get(threadId)!.add(doc.id)
  }

  const groups: ThreadGroup[] = []

  for (const thread_id of threadIds) {
    const messages = corpus
      .filter(d => String(d.metadata.thread_id ?? `__no_thread__:${d.id}`) === thread_id)
      .slice()
      .sort((a, b) => safeTs(a.timestamp) - safeTs(b.timestamp))

    const docset_message_ids = docSetIdsByThread.get(thread_id) ?? new Set<string>()
    const rendered = renderThread({ thread_id, messages, docset_message_ids })
    const token_estimate = Math.ceil(rendered.length / 4)

    groups.push({ thread_id, messages, docset_message_ids, rendered, token_estimate })
  }

  // Stable order: sort by earliest message timestamp for predictability.
  groups.sort((a, b) => safeTs(a.messages[0]?.timestamp ?? '') - safeTs(b.messages[0]?.timestamp ?? ''))

  return groups
}

