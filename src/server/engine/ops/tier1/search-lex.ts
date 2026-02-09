import type { ExecContext, OpResult } from '../../types'
import type { DocSet } from '../../docset'

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let idx = 0
  while (true) {
    const found = haystack.indexOf(needle, idx)
    if (found === -1) break
    count++
    idx = found + needle.length
  }
  return count
}

export async function searchLex(docSet: DocSet, args: Record<string, any>, _ctx: ExecContext): Promise<OpResult> {
  const termsRaw = Array.isArray(args?.terms) ? args.terms.map((t: any) => String(t)) : []
  const mode = (args?.mode ?? 'any') as 'any' | 'all' | 'phrase'
  const caseSensitive = Boolean(args?.case_sensitive ?? false)

  const terms = termsRaw.filter(Boolean)
  const termsNorm = caseSensitive ? terms : terms.map(t => t.toLowerCase())

  const matchedTermsTotals: Record<string, number> = {}
  for (const t of terms) matchedTermsTotals[t] = 0

  const filtered = docSet.filter((doc) => {
    const text = caseSensitive ? doc.text : doc.text.toLowerCase()

    if (termsNorm.length === 0) return false

    if (mode === 'phrase') {
      const phrase = termsNorm.join(' ')
      const ok = text.includes(phrase)
      if (ok) {
        matchedTermsTotals[phrase] = (matchedTermsTotals[phrase] ?? 0) + countOccurrences(text, phrase)
      }
      return ok
    }

    if (mode === 'all') {
      for (const t of termsNorm) {
        if (!text.includes(t)) return false
      }
      // Count occurrences for detail (totals)
      termsNorm.forEach((t, i) => {
        const original = terms[i]!
        matchedTermsTotals[original] = (matchedTermsTotals[original] ?? 0) + countOccurrences(text, t)
      })
      return true
    }

    // mode === 'any'
    let any = false
    termsNorm.forEach((t, i) => {
      if (text.includes(t)) {
        any = true
        const original = terms[i]!
        matchedTermsTotals[original] = (matchedTermsTotals[original] ?? 0) + countOccurrences(text, t)
      }
    })
    return any
  })

  return {
    docSet: filtered,
    meta: {
      duration_ms: 0,
      cost_usd: 0,
      result_count: filtered.docs.length,
      detail: {
        matched_terms: matchedTermsTotals
      }
    }
  }
}

