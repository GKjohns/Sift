import type { OpFn } from './types'

// Tier 1
import { filterMetadata } from './ops/tier1/filter-metadata'
import { searchLex } from './ops/tier1/search-lex'
import { searchRegex } from './ops/tier1/search-regex'
import { topK } from './ops/tier1/top-k'
import { sampleDocs } from './ops/tier1/sample'
import { getContext } from './ops/tier1/get-context'
import { countDocs } from './ops/tier1/count'
import { trendDocs } from './ops/tier1/trend'

// Structural
import { unionSets } from './ops/structural/union'
import { intersectSets } from './ops/structural/intersect'

export const registry: Record<string, OpFn> = {
  // Tier 1 — Free
  filter_metadata: filterMetadata,
  search_lex: searchLex,
  search_regex: searchRegex,
  top_k: topK,
  sample: sampleDocs,
  get_context: getContext,
  count: countDocs,
  trend: trendDocs,

  // Structural
  union: unionSets,
  intersect: intersectSets
}

export const opTier: Record<string, 1 | 2 | 3> = Object.freeze({
  filter_metadata: 1,
  search_lex: 1,
  search_regex: 1,
  top_k: 1,
  sample: 1,
  get_context: 1,
  count: 1,
  trend: 1,
  union: 1,
  intersect: 1
})

