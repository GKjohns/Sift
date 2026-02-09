import type { ExecContext, OpResult } from '../../types'
import type { DocSet } from '../../docset'

export async function searchRegex(docSet: DocSet, args: Record<string, any>, _ctx: ExecContext): Promise<OpResult> {
  const pattern = String(args?.pattern ?? '')
  const flags = String(args?.flags ?? 'gi')

  if (!pattern) {
    const empty = docSet.filter(() => false)
    return {
      docSet: empty,
      meta: { duration_ms: 0, cost_usd: 0, result_count: 0, detail: { matches: [] } }
    }
  }

  let re: RegExp
  try {
    re = new RegExp(pattern, flags)
  } catch (e: any) {
    throw new Error(`Invalid regex /${pattern}/${flags}: ${e?.message ?? e}`)
  }

  const matches: { doc_id: string; match: string; index: number }[] = []

  const filtered = docSet.filter((doc) => {
    re.lastIndex = 0
    const text = doc.text
    let ok = false
    let m: RegExpExecArray | null
    // eslint-disable-next-line no-cond-assign
    while ((m = re.exec(text)) !== null) {
      ok = true
      matches.push({ doc_id: doc.id, match: m[0], index: m.index })
      if (!re.global) break
      // Avoid infinite loops on zero-length matches
      if (m[0].length === 0) re.lastIndex++
    }
    return ok
  })

  return {
    docSet: filtered,
    meta: {
      duration_ms: 0,
      cost_usd: 0,
      result_count: filtered.docs.length,
      detail: { matches }
    }
  }
}

