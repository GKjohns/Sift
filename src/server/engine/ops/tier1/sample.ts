import type { AuditEntry, ExecContext, Labels, OpResult } from '../../types'
import { DocSet } from '../../docset'

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

export async function sampleDocs(docSet: DocSet, args: Record<string, any>, _ctx: ExecContext): Promise<OpResult> {
  const n = Math.max(0, Number(args?.n ?? 0))
  const strategy = (args?.strategy ?? 'random') as 'random' | 'stratified' | 'recent'

  const docs = [...docSet.docs]

  let picked: typeof docs

  if (strategy === 'recent') {
    docs.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    picked = docs.slice(-n)
  } else if (strategy === 'stratified') {
    const groups = new Map<string, typeof docs>()
    for (const d of docs) {
      const k = d.metadata.sender
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(d)
    }

    const total = docs.length || 1
    type Share = { sender: string; exact: number; base: number; frac: number }
    const shares: Share[] = []
    for (const [sender, groupDocs] of groups) {
      const exact = (n * groupDocs.length) / total
      const base = Math.floor(exact)
      shares.push({ sender, exact, base, frac: exact - base })
    }

    let remaining = n - shares.reduce((s, x) => s + x.base, 0)
    shares.sort((a, b) => b.frac - a.frac)
    for (let i = 0; i < shares.length && remaining > 0; i++) {
      shares[i]!.base += 1
      remaining -= 1
    }

    picked = []
    for (const share of shares) {
      const groupDocs = [...(groups.get(share.sender) ?? [])]
      shuffle(groupDocs)
      picked.push(...groupDocs.slice(0, share.base))
    }

    // If we fell short because a group had fewer docs than allocated, top up randomly.
    if (picked.length < n) {
      const remainingDocs = docs.filter(d => !picked.includes(d))
      shuffle(remainingDocs)
      picked.push(...remainingDocs.slice(0, n - picked.length))
    }
  } else {
    // random
    picked = shuffle(docs).slice(0, n)
  }

  const keepIds = new Set(picked.map(d => d.id))
  const nextLabels = new Map<string, Labels>()
  for (const [docId, labels] of docSet.labels) {
    if (keepIds.has(docId)) nextLabels.set(docId, labels)
  }

  const next = new DocSet({ docs: picked, labels: nextLabels, audit: [...(docSet.audit as AuditEntry[])] })

  return {
    docSet: next,
    meta: {
      duration_ms: 0,
      cost_usd: 0,
      result_count: next.docs.length,
      detail: { n, strategy }
    }
  }
}

