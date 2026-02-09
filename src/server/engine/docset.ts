import type { SiftDocument } from '~/types'
import type { AuditEntry, Labels } from './types'

function cloneLabels(labels: Map<string, Labels>): Map<string, Labels> {
  return new Map(labels)
}

export class DocSet {
  readonly docs: ReadonlyArray<SiftDocument>
  readonly labels: ReadonlyMap<string, Labels>
  readonly audit: ReadonlyArray<AuditEntry>

  constructor(opts: { docs: SiftDocument[]; labels?: Map<string, Labels>; audit?: AuditEntry[] }) {
    this.docs = opts.docs
    this.labels = opts.labels ?? new Map()
    this.audit = opts.audit ?? []
  }

  static fromCorpus(docs: SiftDocument[]): DocSet {
    return new DocSet({ docs: [...docs], labels: new Map(), audit: [] })
  }

  static union(...sets: DocSet[]): DocSet {
    const byId = new Map<string, SiftDocument>()
    const mergedLabels = new Map<string, Labels>()
    const mergedAudit: AuditEntry[] = []

    for (const set of sets) {
      for (const doc of set.docs) byId.set(doc.id, doc)
      for (const [docId, labels] of set.labels) mergedLabels.set(docId, labels)
      mergedAudit.push(...set.audit)
    }

    return new DocSet({
      docs: [...byId.values()],
      labels: mergedLabels,
      audit: mergedAudit
    })
  }

  static intersect(...sets: DocSet[]): DocSet {
    if (sets.length === 0) return new DocSet({ docs: [], labels: new Map(), audit: [] })
    if (sets.length === 1) return sets[0]!

    const [first, ...rest] = sets
    const keepIds = new Set(first!.docs.map(d => d.id))
    for (const set of rest) {
      const ids = new Set(set.docs.map(d => d.id))
      for (const id of [...keepIds]) {
        if (!ids.has(id)) keepIds.delete(id)
      }
    }

    const docs = first!.docs.filter(d => keepIds.has(d.id))

    // Merge labels: later sets overwrite earlier.
    const mergedLabels = new Map<string, Labels>()
    for (const set of sets) {
      for (const [docId, labels] of set.labels) {
        if (keepIds.has(docId)) mergedLabels.set(docId, labels)
      }
    }

    const mergedAudit: AuditEntry[] = []
    for (const set of sets) mergedAudit.push(...set.audit)

    return new DocSet({ docs, labels: mergedLabels, audit: mergedAudit })
  }

  filter(predicate: (doc: SiftDocument) => boolean): DocSet {
    const docs = this.docs.filter(predicate)
    const keep = new Set(docs.map(d => d.id))
    const nextLabels = new Map<string, Labels>()
    for (const [docId, labels] of this.labels) {
      if (keep.has(docId)) nextLabels.set(docId, labels)
    }
    return new DocSet({ docs: [...docs], labels: nextLabels, audit: [...this.audit] })
  }

  withLabels(next: Map<string, Labels>): DocSet {
    return new DocSet({ docs: [...this.docs], labels: cloneLabels(next), audit: [...this.audit] })
  }

  withAudit(entry: AuditEntry): DocSet {
    return new DocSet({ docs: [...this.docs], labels: cloneLabels(this.labels as Map<string, Labels>), audit: [...this.audit, entry] })
  }
}

