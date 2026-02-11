import type { ExecContext, Labels, OpResult } from '../../types'
import type { DocSet } from '../../docset'

/**
 * filter_by_label — Filter documents based on their LLM-generated labels.
 *
 * Labels are stored uniformly as:
 *   { value: string, confidence: number, rationale: string, thread_meta?: ... }
 *
 * Under a key like "tone", "topic", or "label" (for custom schemas).
 *
 * Condition syntax (all AND-joined):
 *   "label == yes"
 *   "label == yes AND confidence > 0.7"
 *   "tone == hostile AND confidence >= 0.6"
 *   "label != no"
 *
 * Field resolution order:
 *   1. "label" / "value" → entry.value (the label string)
 *   2. "confidence"       → entry.confidence
 *   3. Direct key match   → labels[field].value (e.g., "tone" → labels.tone.value)
 *
 * When multiple label keys exist, the first non-undefined match wins.
 */

type Comparator = '==' | '!=' | '>' | '<' | '>=' | '<='

interface Clause {
  field: string
  comparator: Comparator
  value: string
}

const COMPARATORS: Comparator[] = ['>=', '<=', '!=', '==', '>', '<']

function parseClauses(condition: string): Clause[] {
  const parts = condition.split(/\s+AND\s+/i)
  const clauses: Clause[] = []

  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue

    let found = false
    for (const cmp of COMPARATORS) {
      const idx = trimmed.indexOf(cmp)
      if (idx === -1) continue

      const field = trimmed.slice(0, idx).trim()
      const value = trimmed.slice(idx + cmp.length).trim()
        .replace(/^["']|["']$/g, '') // strip quotes
      if (field) {
        clauses.push({ field, comparator: cmp, value })
        found = true
        break
      }
    }

    if (!found) {
      // Bare field → treat as "field == true"  (e.g., "matches")
      clauses.push({ field: trimmed, comparator: '==', value: 'true' })
    }
  }

  return clauses
}

/**
 * Get the first label entry from a Labels map.
 * Most plans produce a single label step, so there's one entry.
 */
function firstEntry(labels: Labels): { value: any; confidence: number } | null {
  for (const key of Object.keys(labels)) {
    const e = labels[key]
    if (e) return e
  }
  return null
}

function resolveField(labels: Labels, field: string): any {
  const f = field.toLowerCase().trim()

  // Direct key match: "tone", "topic", "label", etc.
  const direct = labels[f] ?? labels[field]
  if (direct) return direct.value

  // "label" or "value" → return the value of the first (or only) entry
  if (f === 'label' || f === 'value') {
    return firstEntry(labels)?.value
  }

  // "confidence" → return confidence of the first entry
  if (f === 'confidence') {
    return firstEntry(labels)?.confidence ?? 0
  }

  // Last resort: scan all entries for one whose value matches field name
  // (handles "tone" when the key is actually "tone")
  for (const key of Object.keys(labels)) {
    const e = labels[key]
    if (!e) continue
    if (key.toLowerCase() === f) return e.value
  }

  return undefined
}

function evaluate(actual: any, comparator: Comparator, expected: string): boolean {
  // Coerce expected
  const expLower = expected.toLowerCase()
  const expBool = expLower === 'true' ? true : expLower === 'false' ? false : null
  const expNum = Number(expected)

  if (comparator === '==') {
    if (expBool !== null && typeof actual === 'boolean') return actual === expBool
    if (typeof actual === 'number' && Number.isFinite(expNum)) return actual === expNum
    return String(actual).toLowerCase() === expLower
  }
  if (comparator === '!=') {
    return !evaluate(actual, '==', expected)
  }

  // Numeric comparisons
  const numActual = Number(actual)
  if (!Number.isFinite(numActual) || !Number.isFinite(expNum)) return false

  if (comparator === '>') return numActual > expNum
  if (comparator === '<') return numActual < expNum
  if (comparator === '>=') return numActual >= expNum
  if (comparator === '<=') return numActual <= expNum

  return false
}

export async function filterByLabel(docSet: DocSet, args: Record<string, any>, _ctx: ExecContext): Promise<OpResult> {
  const condition = String(args?.condition ?? '').trim()

  if (!condition) {
    return {
      docSet,
      meta: { duration_ms: 0, cost_usd: 0, result_count: docSet.docs.length, detail: { skipped: true, reason: 'empty_condition' } }
    }
  }

  const clauses = parseClauses(condition)

  if (clauses.length === 0) {
    return {
      docSet,
      meta: { duration_ms: 0, cost_usd: 0, result_count: docSet.docs.length, detail: { skipped: true, reason: 'no_valid_clauses', condition } }
    }
  }

  const filtered = docSet.filter((doc) => {
    const labels = docSet.labels.get(doc.id)
    if (!labels) return false

    for (const clause of clauses) {
      const actual = resolveField(labels, clause.field)
      if (actual === undefined) return false
      if (!evaluate(actual, clause.comparator, clause.value)) return false
    }
    return true
  })

  return {
    docSet: filtered,
    meta: {
      duration_ms: 0,
      cost_usd: 0,
      result_count: filtered.docs.length,
      detail: { condition, clauses, input_count: docSet.docs.length, output_count: filtered.docs.length }
    }
  }
}
