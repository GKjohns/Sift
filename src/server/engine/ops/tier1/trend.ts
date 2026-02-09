import type { ExecContext, OpResult } from '../../types'
import type { DocSet } from '../../docset'

type Metric = 'count' | 'hostile_count' | 'avg_word_count'
type Interval = 'day' | 'week' | 'month'

function isoWeekKey(isoDatetime: string): string {
  const d = new Date(isoDatetime)
  if (!Number.isFinite(d.getTime())) return 'invalid'

  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  const yyyy = date.getUTCFullYear()
  const ww = String(weekNo).padStart(2, '0')
  return `${yyyy}-W${ww}`
}

function periodKey(ts: string, interval: Interval): string {
  if (interval === 'month') return ts.slice(0, 7)
  if (interval === 'day') return ts.slice(0, 10)
  return isoWeekKey(ts)
}

export async function trendDocs(docSet: DocSet, args: Record<string, any>, _ctx: ExecContext): Promise<OpResult> {
  const metric = (args?.metric ?? 'count') as Metric
  const interval = (args?.interval ?? 'month') as Interval

  const buckets = new Map<string, { count: number; wordSum: number; hostileCount: number }>()

  for (const doc of docSet.docs) {
    const key = periodKey(doc.timestamp, interval)
    if (!buckets.has(key)) buckets.set(key, { count: 0, wordSum: 0, hostileCount: 0 })
    const b = buckets.get(key)!
    b.count += 1
    b.wordSum += doc.metadata.word_count

    if (metric === 'hostile_count') {
      const tone = docSet.labels.get(doc.id)?.tone?.value
      if (tone === 'hostile') b.hostileCount += 1
    }
  }

  const keys = [...buckets.keys()].sort()
  const points = keys.map((k) => {
    const b = buckets.get(k)!
    let value: number
    if (metric === 'avg_word_count') value = b.count ? b.wordSum / b.count : 0
    else if (metric === 'hostile_count') value = b.hostileCount
    else value = b.count
    return { period: k, value: Math.round(value * 1000) / 1000 }
  })

  return {
    docSet,
    meta: {
      duration_ms: 0,
      cost_usd: 0,
      result_count: docSet.docs.length,
      detail: { metric, interval, points }
    }
  }
}

