import type { ExecContext, Labels, OpResult } from '../../types'
import type { DocSet } from '../../docset'

type GroupBy = 'sender' | 'thread' | 'month' | 'week' | 'tone' | 'topic'

function isoWeekKey(isoDatetime: string): string {
  const d = new Date(isoDatetime)
  if (!Number.isFinite(d.getTime())) return 'invalid'

  // ISO week date algorithm (UTC)
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  // Thursday in current week decides the year.
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  const yyyy = date.getUTCFullYear()
  const ww = String(weekNo).padStart(2, '0')
  return `${yyyy}-W${ww}`
}

function getLabelValue(labels: Labels | undefined, schema: 'tone' | 'topic'): string | null {
  if (!labels) return null
  const entry = labels[schema]
  if (!entry) return null
  return String(entry.value)
}

export async function countDocs(docSet: DocSet, args: Record<string, any>, _ctx: ExecContext): Promise<OpResult> {
  const by = (args?.by ?? null) as GroupBy | null

  if (!by) {
    return {
      docSet,
      meta: {
        duration_ms: 0,
        cost_usd: 0,
        result_count: docSet.docs.length,
        detail: { total: docSet.docs.length }
      }
    }
  }

  const groups: Record<string, number> = {}

  for (const doc of docSet.docs) {
    let key: string

    if (by === 'sender') key = doc.metadata.sender
    else if (by === 'thread') key = doc.metadata.thread_id || doc.id
    else if (by === 'month') key = doc.timestamp.slice(0, 7) // YYYY-MM
    else if (by === 'week') key = isoWeekKey(doc.timestamp)
    else if (by === 'tone' || by === 'topic') {
      const labels = docSet.labels.get(doc.id)
      key = getLabelValue(labels, by) ?? 'unlabeled'
    } else key = 'unknown'

    groups[key] = (groups[key] ?? 0) + 1
  }

  return {
    docSet,
    meta: {
      duration_ms: 0,
      cost_usd: 0,
      result_count: docSet.docs.length,
      detail: {
        total: docSet.docs.length,
        groups
      }
    }
  }
}

