# Sift Execution Engine — Architecture Doc

## Overview

The execution engine is how Sift turns a natural-language query into results. The flow is:

```
User query (natural language)
    ↓
LLM Planning Call — decomposes query into a DAG of operations
    ↓
Plan Executor — runs each operation, threading DocSets through the graph
    ↓
LLM Synthesis Call — formats the final answer with citations
    ↓
Result returned to UI with full execution trace
```

Three principles govern the design:

1. **Deterministic first, LLM last.** Tier 1 (free) and Tier 2 (cheap) operations narrow the document set before any expensive LLM operation touches it.
2. **DocSet in, DocSet out.** Every operation has the same shape: it takes a DocSet and returns a DocSet (plus metadata). This uniformity is what makes everything composable.
3. **The plan is data, not code.** The LLM outputs a JSON array of steps. The executor interprets it. No generated code, no sandboxing, no eval. (This may change later — the stdlib is designed so that migrating to an LLM-writes-JS model only changes the executor, not the operations.)

---

## Plan Format

A plan is an ordered JSON array of steps. The array **must** be in topological order — a step's dependencies always appear before it.

### Step Schema

```typescript
interface PlanStep {
  op: string                        // Operation name (must exist in the registry)
  args: Record<string, any>         // Arguments for the operation
  id?: string                       // Optional. Only needed if another step references this one.
  input?: string | string[]         // Optional. Where this step gets its DocSet.
  rationale?: string                // Optional. Why the planner chose this step.
  estimated_cost?: number           // Optional. Estimated USD cost (0 for free ops).
}
```

### Input Resolution Rules

The `input` field controls where a step gets its data:

| `input` value | Behavior |
|---|---|
| *omitted* | Takes the previous step's output. First step takes the full corpus. |
| `"corpus"` | Starts fresh from the full corpus (ignores previous steps). |
| `"some_id"` | Takes the output of the step with `id: "some_id"`. |
| `["a", "b"]` | Union of the outputs of steps `a` and `b`. |

### Linear Plan (Common Case)

90% of plans are linear chains. They look exactly like a flat array with no `id` or `input` fields:

```json
[
  { "op": "filter_metadata", "args": { "sender": "Sarah Mitchell", "after": "2025-03-01" } },
  { "op": "search_lex", "args": { "terms": ["lawyer", "court"], "mode": "any" } },
  { "op": "label", "args": { "schema": "tone" } },
  { "op": "filter_by_label", "args": { "condition": "tone == hostile AND confidence > 0.7" } }
]
```

Step 1 takes the corpus. Step 2 takes step 1's output. Step 3 takes step 2's output. And so on.

### Branching Plan (DAG)

When the query requires searching from multiple angles and merging, steps use `id` and `input`:

```json
[
  {
    "id": "lex",
    "op": "search_lex",
    "args": { "terms": ["schedule", "pickup", "weekend", "custody"], "mode": "any" },
    "rationale": "Cheap keyword pass for obvious scheduling vocabulary"
  },
  {
    "id": "sem",
    "op": "search_semantic",
    "input": "corpus",
    "args": { "query": "scheduling conflicts and disputes", "k": 30 },
    "rationale": "Catch messages that use indirect language about scheduling"
  },
  {
    "op": "union",
    "input": ["lex", "sem"],
    "rationale": "Merge lexical and semantic results for better recall"
  },
  {
    "op": "label",
    "args": { "schema": "tone" }
  },
  {
    "op": "filter_by_label",
    "args": { "condition": "tone == hostile AND confidence > 0.7" }
  }
]
```

Steps `lex` and `sem` are independent roots — they both operate on the full corpus. The `union` step merges them. Steps 4 and 5 chain linearly from there.

**Key constraint:** the array is always in topological order. A step's dependencies must appear before it. If a step references an `id` that hasn't been computed yet, the executor throws — it's a malformed plan.

### Why This Stays Clean

- **The common case is invisible.** Linear plans have zero annotation overhead.
- **The LLM only thinks about `id` and `input` when branching.** The prompt teaches this in one example.
- **The executor is still a forward loop**, not a graph traversal algorithm. Topological order is enforced by the plan structure.
- **`union` is the only merge op needed** for document analysis. (An `intersect` op could be added later — same DAG structure, different merge semantics.)

---

## Core Data Types

### DocSet

The primary data container. Every operation takes one and returns one.

```typescript
class DocSet {
  readonly docs: SiftDocument[]          // The documents in this set
  readonly labels: Map<string, Labels>   // LLM-generated labels, keyed by doc ID
  readonly audit: AuditEntry[]           // How this DocSet was produced

  static fromCorpus(docs: SiftDocument[]): DocSet
  static union(...sets: DocSet[]): DocSet
  static intersect(...sets: DocSet[]): DocSet
}
```

A DocSet carries its audit trail with it. When you filter a DocSet, the resulting DocSet's `audit` array includes the new filter entry appended to the parent's trail. This means any DocSet can explain its own provenance.

Labels are attached to the DocSet, not the documents themselves. This keeps documents immutable and allows multiple labeling passes (e.g., tone labels and topic labels) to coexist.

### Labels

```typescript
interface Labels {
  tone?: { value: ToneLabel; confidence: number; rationale: string; key_phrases: string[] }
  topic?: { value: string; confidence: number }
  commitment?: { value: string; confidence: number; spans: Span[] }
  violation?: { value: string; confidence: number; spans: Span[] }
  [custom: string]: { value: any; confidence: number; [key: string]: any } | undefined
}
```

Extensible by schema name. The `label` op's `schema` argument determines which key gets populated.

### AuditEntry

```typescript
interface AuditEntry {
  op: string
  args: Record<string, any>
  timestamp: string
  input_count: number
  output_count: number
  duration_ms: number
  cost_usd: number
}
```

### ExecContext

Shared state for the duration of one plan execution.

```typescript
interface ExecContext {
  corpus: SiftDocument[]          // The full corpus (immutable reference)
  budget: Budget                  // Tracks and enforces cost limits
  trace: StepTrace[]              // Accumulated step-by-step results for UI
  openai: OpenAI                  // LLM client (for Tier 3 ops)
}

interface Budget {
  limit_usd: number               // Max allowed spend for this execution
  spent_usd: number               // Running total
  check(estimated: number): void  // Throws BudgetExceededError if over
}

interface StepTrace {
  step: PlanStep
  input_count: number
  output_count: number
  duration_ms: number
  cost_usd: number
  detail: any                     // Op-specific metadata
}
```

---

## Operation Signatures

Every operation is a function with this signature:

```typescript
type OpFn = (docSet: DocSet, args: Record<string, any>, ctx: ExecContext) => Promise<OpResult>

interface OpResult {
  docSet: DocSet
  meta: {
    duration_ms: number
    cost_usd: number
    result_count: number
    detail: any
  }
}
```

DocSet in, DocSet out. Always. Even aggregation ops (like `count`) — they return the same DocSet unmodified but attach the aggregation in `meta.detail`.

### Operation Registry

```typescript
const registry: Record<string, OpFn> = {
  // Tier 1 — Free
  filter_metadata: filterMetadata,
  search_lex: searchLex,
  search_regex: searchRegex,
  top_k: topK,
  sample: sampleDocs,
  get_context: getContext,
  count: countDocs,
  trend: trendDocs,

  // Tier 2 — Cheap
  search_semantic: searchSemantic,
  cluster: clusterDocs,

  // Tier 3 — Expensive (LLM)
  label: labelDocuments,
  extract: extractFields,
  filter_by_label: filterByLabel,

  // Aggregation
  timeline: buildTimeline,

  // Structural
  union: unionSets,
  intersect: intersectSets,
}
```

---

## Operations Reference

### Tier 1 — Free (Deterministic)

These ops run locally with no external API calls. Cost is always $0.

#### `filter_metadata`

Filter documents by metadata fields.

```
Args:
  sender?: string           — Exact match on sender name
  recipient?: string        — Exact match on recipient name
  after?: string            — ISO date string, inclusive lower bound on timestamp
  before?: string           — ISO date string, exclusive upper bound on timestamp
  thread_id?: string        — Exact match on thread ID
  min_words?: number        — Minimum word count
  max_words?: number        — Maximum word count
```

#### `search_lex`

Keyword search over document text. Returns documents that match.

```
Args:
  terms: string[]           — Keywords to search for
  mode: "any" | "all" | "phrase"
    - "any": document contains at least one term
    - "all": document contains every term
    - "phrase": document contains the exact phrase (terms joined by space)
  case_sensitive?: boolean  — Default false
```

**Detail output:** `{ matched_terms: Record<string, number> }` — counts of each term's occurrences.

#### `search_regex`

Regex search over document text.

```
Args:
  pattern: string           — JavaScript-compatible regex pattern
  flags?: string            — Regex flags (default: "gi")
```

**Detail output:** `{ matches: { doc_id: string, match: string, index: number }[] }`

#### `top_k`

Take the top K documents by a sort key. Used to cap set size before expensive ops.

```
Args:
  k: number                 — How many documents to keep
  by: "timestamp" | "word_count" | "relevance"
  order?: "asc" | "desc"   — Default "desc"
```

#### `sample`

Sample a subset of documents.

```
Args:
  n: number                 — Sample size
  strategy: "random" | "stratified" | "recent"
    - "random": uniform random sample
    - "stratified": proportional sample per sender
    - "recent": most recent N documents
```

#### `get_context`

Given a document, retrieve surrounding messages in the same thread for conversational context.

```
Args:
  doc_id: string            — The document to get context for
  window: number            — Number of messages before and after (default: 3)
```

#### `count`

Count documents, optionally grouped by a field. Returns the DocSet unmodified; counts go in `meta.detail`.

```
Args:
  by?: "sender" | "thread" | "month" | "week" | "tone" | "topic"
```

**Detail output:** `{ total: number, groups?: Record<string, number> }`

#### `trend`

Compute a metric over time intervals. Returns the DocSet unmodified; trend data goes in `meta.detail`.

```
Args:
  metric: "count" | "hostile_count" | "avg_word_count"
  interval: "day" | "week" | "month"
```

**Detail output:** `{ points: { period: string, value: number }[] }`

### Tier 2 — Cheap (Embeddings)

These ops use embedding models. Cost is ~$0.001-0.01 per call.

#### `search_semantic`

Embedding similarity search against document vectors.

```
Args:
  query: string             — Natural language search query
  k: number                 — Max results to return (default: 20)
  threshold?: number        — Minimum similarity score (0-1, default: 0.5)
```

**Note:** Requires a vector index. For the POC, this will use in-memory cosine similarity over pre-computed embeddings. Later, this could hit a vector DB.

#### `cluster`

Group documents by theme using embedding similarity.

```
Args:
  method: "topic" | "sender_behavior"
  k?: number                — Number of clusters (auto-detected if omitted)
```

**Detail output:** `{ clusters: { label: string, doc_ids: string[], representative_doc_id: string }[] }`

### Tier 3 — Expensive (LLM per Document)

These ops call the LLM for each document (or batch of documents). They check the budget before executing.

#### `label`

Classify documents according to a schema. Batches documents for efficiency (10-20 per LLM call).

```
Args:
  schema: "tone" | "topic" | "commitment" | "violation" | string
  budget?: number           — Max USD to spend on this op (default: uses remaining execution budget)
  model?: string            — Override the default model (default: "gpt-5-nano" for tone/topic, "gpt-5-mini" for complex schemas)
```

Labels are attached to the output DocSet's `labels` map, not the documents themselves.

**Schemas:**
- `"tone"`: hostile / neutral / cooperative, with confidence and key phrases
- `"topic"`: scheduling / medical / school / activities / expenses / custody exchange / other
- `"commitment"`: extract commitments made ("I'll register him today", "I'll send the flight details")
- `"violation"`: identify potential custody agreement violations

Custom schemas can be defined as a string describing what to classify.

#### `extract`

Pull structured fields from documents. Returns spans (substring references with start/end positions).

```
Args:
  schema: "commitments" | "dates" | "claims" | "violations" | "financial" | string
  model?: string            — Override model (default: "gpt-5-mini")
```

**Detail output:** `{ extractions: Record<string, { fields: any, spans: Span[] }> }` keyed by doc_id.

#### `filter_by_label`

Filter documents based on previously-applied LLM labels.

```
Args:
  condition: string         — Filter expression, e.g. "tone == hostile AND confidence > 0.7"
```

**Condition syntax:** Simple boolean expressions over label fields.
- Comparisons: `field == value`, `field != value`, `field > number`, `field >= number`, `field < number`, `field <= number`
- Boolean operators: `AND`, `OR` (AND binds tighter)
- Fields: `{schema}` for the label value, `confidence` for confidence score
- Example: `tone == hostile AND confidence > 0.7`
- Example: `topic == scheduling OR topic == custody_exchange`

**Important:** This op requires that the relevant `label` op has already run. If the DocSet has no labels for the referenced schema, it throws an error.

### Aggregation

#### `timeline`

Extract discrete events from documents, ordered chronologically with citations. This is an LLM op (Tier 3 cost) but produces a fundamentally different output shape — the events go in `meta.detail`.

```
Args:
  max_events?: number       — Cap on events to extract (default: 20)
  topic_filter?: string     — Focus on events about a specific topic
  significance?: "high" | "medium" | "low"  — Minimum significance threshold
  model?: string            — Override model (default: "gpt-5-mini")
```

**Detail output:** `{ events: TimelineEvent[], summary: string }`

### Structural Ops

#### `union`

Merge multiple DocSets, deduplicating by document ID. Labels from all input sets are preserved (later labels overwrite earlier ones for the same doc).

```
Input: string[]             — Array of step IDs to merge
Args: (none)
```

#### `intersect`

Keep only documents that appear in ALL input DocSets.

```
Input: string[]             — Array of step IDs to intersect
Args: (none)
```

---

## Plan Executor

The executor walks the plan array forward, resolves inputs, and dispatches to the registry.

### Pseudocode

```typescript
async function executePlan(plan: PlanStep[], ctx: ExecContext): Promise<ExecutionResult> {
  const outputs = new Map<string, OpResult>()
  let prevKey: string | null = null

  for (let i = 0; i < plan.length; i++) {
    const step = plan[i]
    const key = step.id ?? `_step_${i}`

    // ── Resolve input ──
    let inputDocSet: DocSet

    if (!step.input) {
      // Default: previous step's output, or full corpus if first step
      inputDocSet = prevKey
        ? outputs.get(prevKey)!.docSet
        : DocSet.fromCorpus(ctx.corpus)
    } else if (step.input === 'corpus') {
      inputDocSet = DocSet.fromCorpus(ctx.corpus)
    } else if (Array.isArray(step.input)) {
      // Multi-input: resolve each reference and union
      const sets = step.input.map(ref => {
        const out = outputs.get(ref)
        if (!out) throw new PlanError(`Step "${key}" references "${ref}" which hasn't executed yet`)
        return out.docSet
      })
      inputDocSet = DocSet.union(...sets)
    } else {
      // Single reference
      const out = outputs.get(step.input)
      if (!out) throw new PlanError(`Step "${key}" references "${step.input}" which hasn't executed yet`)
      inputDocSet = out.docSet
    }

    // ── Dispatch ──
    const fn = registry[step.op]
    if (!fn) throw new PlanError(`Unknown operation: "${step.op}"`)

    const t0 = performance.now()
    const result = await fn(inputDocSet, step.args ?? {}, ctx)
    const duration_ms = performance.now() - t0

    // ── Record trace ──
    ctx.trace.push({
      step,
      input_count: inputDocSet.docs.length,
      output_count: result.docSet.docs.length,
      duration_ms,
      cost_usd: result.meta.cost_usd,
      detail: result.meta.detail
    })

    outputs.set(key, result)
    prevKey = key
  }

  return {
    finalDocSet: outputs.get(prevKey!)!.docSet,
    trace: ctx.trace,
    totalCost: ctx.budget.spent_usd
  }
}
```

### Error Handling

- **Unknown op:** `PlanError` — the planner generated an op not in the registry.
- **Missing reference:** `PlanError` — a step references an `id` that doesn't exist or hasn't executed yet.
- **Budget exceeded:** `BudgetExceededError` — a Tier 3 op's estimated cost would exceed the remaining budget. The executor stops and returns partial results with the trace so far.
- **LLM failure:** Tier 3 ops catch API errors and retry once. On second failure, the step is marked as failed in the trace and the executor continues with the input DocSet unchanged (skip the failed step).

### Future: Parallel Execution

Steps whose inputs are all already resolved (or `"corpus"`) can run concurrently. Detection is simple:

1. For each step, collect its input dependencies
2. If all dependencies are in `outputs`, the step is ready
3. Batch all ready steps and `Promise.all` them

This is an optimization. The serial forward loop is correct and sufficient for the POC.

---

## Full Query Flow

End-to-end example: **"Find hostile messages about scheduling"**

### Phase 1: Planning

One LLM call. The planner receives the corpus summary and available operations as context, and outputs a plan.

```
Input:  "Find hostile messages about scheduling"
Model:  gpt-5-mini (reasoning: medium)
Output: JSON plan (see branching example above)
```

### Phase 2: Execution

The executor runs each step:

```
Step 1 (search_lex, id: "lex")
  Input: corpus (59 docs)
  → 18 docs matched keywords ["schedule", "pickup", "weekend", "custody"]
  Cost: $0.00 | 3ms

Step 2 (search_semantic, id: "sem")
  Input: corpus (59 docs)
  → 14 docs matched "scheduling conflicts and disputes"
  Cost: $0.002 | 120ms

Step 3 (union)
  Input: ["lex", "sem"]
  → 26 unique docs (6 overlap)
  Cost: $0.00 | 0ms

Step 4 (label, schema: "tone")
  Input: 26 docs
  → 26 docs labeled (batched into 3 LLM calls)
  Cost: $0.018 | 2100ms

Step 5 (filter_by_label, condition: "tone == hostile AND confidence > 0.7")
  Input: 26 docs
  → 9 docs remain
  Cost: $0.00 | 1ms
```

### Phase 3: Synthesis

One LLM call. The synthesizer receives the query, the 9 remaining documents, their labels, and the execution trace.

```
Input:  query + 9 documents + labels + trace
Model:  gpt-5-mini
Output: Prose answer with inline citations
```

### Result

Returned to the UI:

```typescript
{
  answer: "Nine messages showed hostile tone around scheduling topics...",
  citations: [{ doc_id: "doc-002", message_number: 2, preview: "..." }, ...],
  trace: [ /* the 5 step traces above */ ],
  total_cost: 0.024,
  documents_touched: 59
}
```

The UI renders the trace as the pipeline visualization (each step = a node in the pipeline diagram), and the answer with clickable citation badges.

---

## Cost Model

| Tier | Cost Per Call | Examples |
|---|---|---|
| 1 | $0.00 | filter_metadata, search_lex, search_regex, top_k, sample, count, trend |
| 2 | $0.001–0.01 | search_semantic (~$0.002 per call), cluster (~$0.005) |
| 3 | $0.005–0.10 | label (~$0.001/doc with nano, ~$0.005/doc with mini), extract (~$0.005/doc), timeline (~$0.02 per call) |

### Budget Enforcement

Every execution has a budget (default: $1.00, configurable by the UI). Before a Tier 3 op executes, it estimates its cost and calls `ctx.budget.check(estimate)`. If the estimate would exceed the remaining budget, `BudgetExceededError` is thrown.

The UI can surface this as: "This query would cost approximately $X.XX. The label step alone needs to process N documents at ~$0.001 each. Would you like to proceed, or add filters to narrow the set first?"

---

## File Structure

```
src/server/
  engine/
    types.ts          — PlanStep, OpResult, ExecContext, Budget, etc.
    docset.ts         — DocSet class
    executor.ts       — executePlan function
    registry.ts       — Operation registry (maps op names → functions)
    errors.ts         — PlanError, BudgetExceededError
    ops/
      tier1/
        filter-metadata.ts
        search-lex.ts
        search-regex.ts
        top-k.ts
        sample.ts
        get-context.ts
        count.ts
        trend.ts
      tier2/
        search-semantic.ts
        cluster.ts
      tier3/
        label.ts
        extract.ts
        filter-by-label.ts
        timeline.ts
      structural/
        union.ts
        intersect.ts
    planner.ts        — LLM planning call (query → plan)
    synthesizer.ts    — LLM synthesis call (results → answer)
```

All files live under `src/server/engine/`. The engine is a server-only concern — the UI never imports from it directly. API routes in `src/server/api/` call the engine and return results.

---

## Design Decisions & Constraints

### Why JSON plans, not generated code

- **No sandbox required.** No `eval`, no `isolated-vm`, no security surface.
- **Full auditability.** Every step is a named operation with explicit arguments. The UI can render it directly.
- **LLM reliability.** LLMs generate clean JSON with structured output mode far more reliably than they generate correct, runnable JavaScript.
- **The upgrade path exists.** If we later want the LLM to write JS, the stdlib functions don't change — only the executor does. The `OpFn` signature is the same whether called from a dispatch loop or from generated code.

### Why DocSet in / DocSet out

- **Uniform composability.** Any op can follow any other op. No special cases.
- **Aggregation ops don't break the chain.** `count` returns the same DocSet — the counts are in `meta.detail`. This means you can count and then continue filtering.
- **Labels travel with the set.** When you `label` a DocSet and then `filter_by_label`, the labels are right there on the DocSet. No separate lookup.

### Why topological-order arrays, not graph objects

- **LLMs think sequentially.** They naturally output "first do X, then do Y." Asking for a graph adjacency list or edge set is fighting the model's reasoning pattern.
- **Linear plans have zero overhead.** No `id` fields, no `input` fields. Just an array of ops.
- **The executor is a for loop.** No topological sort algorithm needed at runtime — the sort is done at plan-generation time by the LLM.

### Restrictions

- **No nested plans.** A plan is a flat array. If you need sub-plans, you need multiple executor invocations (this could be added later with a `sub_plan` op, but it's not needed yet).
- **No loops in plans.** The DAG is acyclic by construction (forward references only). If the LLM generates a cycle, the executor will hit a "reference not found" error, which is the correct behavior.
- **filter_by_label requires prior labeling.** The executor does not auto-insert a `label` step. If the plan filters by labels that don't exist, it throws. The planner must include the `label` step explicitly.
- **Budget is per-execution, not per-step.** Individual steps don't have budgets (except via the `budget` arg on `label`). The global budget is the enforcement mechanism.
- **Condition syntax is intentionally limited.** `filter_by_label` conditions support simple comparisons and AND/OR. No nested parentheses, no function calls. If you need complex filtering logic, use multiple `filter_by_label` steps or chain with `filter_metadata`.

---

## Implementation Sprints

Three sprints, each building on the last. Sprint 1 produces a running engine with no external API calls. Sprint 2 adds the LLM and embedding operations. Sprint 3 wires everything into the live API and replaces the fake data layer.

---

### Sprint 1 — Core Engine Skeleton + Tier 1 + Structural Ops

**Goal:** A fully functional executor that can run plans composed of free (Tier 1) and structural operations against the in-memory corpus. No external API calls. Everything is testable with the existing fake data in `server/utils/fake-data.ts`.

#### Deliverables

| File | What it does |
|---|---|
| `server/engine/types.ts` | All engine-specific types: `PlanStep`, `OpResult`, `OpFn`, `ExecContext`, `Budget`, `StepTrace`, `ExecutionResult`, `Labels`, `AuditEntry`. Import `SiftDocument` from `~/types` — don't duplicate it. |
| `server/engine/errors.ts` | `PlanError` (malformed plan / unknown op / missing ref) and `BudgetExceededError` (cost limit hit). Both extend `Error` with structured fields for the UI. |
| `server/engine/docset.ts` | `DocSet` class: `docs`, `labels`, `audit`. Static methods: `fromCorpus()`, `union()`, `intersect()`. Instance helpers: `filter()`, `withLabels()`, `withAudit()`. Immutable — every method returns a new DocSet. |
| `server/engine/registry.ts` | `registry: Record<string, OpFn>` map. Imports all ops and registers them by name. Single source of truth for what ops exist. |
| `server/engine/executor.ts` | `executePlan(plan, ctx)` — the forward loop from the pseudocode section. Resolves inputs (previous step / corpus / named ref / multi-ref union), dispatches to registry, accumulates trace. Returns `ExecutionResult`. |
| `server/engine/ops/tier1/filter-metadata.ts` | Filter by `sender`, `recipient`, `after`, `before`, `thread_id`, `min_words`, `max_words`. All comparisons are case-insensitive for string fields. |
| `server/engine/ops/tier1/search-lex.ts` | Keyword search with `mode: "any" | "all" | "phrase"`. Case-insensitive by default. Detail output: matched term counts. |
| `server/engine/ops/tier1/search-regex.ts` | Regex search over `doc.text`. Returns matches with doc ID, matched string, and index. |
| `server/engine/ops/tier1/top-k.ts` | Sort by `timestamp`, `word_count`, or `relevance` (relevance = position order in current set). Take top K. |
| `server/engine/ops/tier1/sample.ts` | `random`, `stratified` (proportional by sender), `recent` (most recent N). |
| `server/engine/ops/tier1/get-context.ts` | Given a `doc_id`, find surrounding messages in the same thread from `ctx.corpus`. Return the window as a new DocSet. |
| `server/engine/ops/tier1/count.ts` | Count docs, optionally grouped by `sender`, `thread`, `month`, `week`, `tone`, `topic`. Returns DocSet unchanged; groups go in `meta.detail`. |
| `server/engine/ops/tier1/trend.ts` | Compute metric (`count`, `hostile_count`, `avg_word_count`) over time intervals (`day`, `week`, `month`). DocSet unchanged; time series in `meta.detail`. |
| `server/engine/ops/structural/union.ts` | Merge DocSets by deduplicating on `doc.id`. Labels from later sets overwrite earlier ones. |
| `server/engine/ops/structural/intersect.ts` | Keep only docs present in ALL input sets. Merge labels. |

#### Key decisions for this sprint

- **`DocSet.labels` uses `Map<string, Labels>` keyed by doc ID.** The `Labels` interface is extensible (tone, topic, commitment, violation, plus `[custom: string]`). Even though Tier 3 ops that populate labels come in Sprint 2, the data structure is defined here so that `count(by: "tone")` and `trend(metric: "hostile_count")` can read labels if they exist.
- **`Budget` is implemented as a class** with `limit_usd`, `spent_usd`, and `check(estimated)`. It's a no-op for Tier 1 ops (cost = 0) but the wiring is in place for Sprint 2.
- **The executor returns partial results on error.** If a step fails, the trace includes the failure and the executor returns what it has so far (not an exception). This is critical for the UI to show "3 of 5 steps completed."
- **`ExecContext.corpus` is the full document array** from `generateDocuments()` for now. Sprint 3 replaces this with real corpus data.

#### Acceptance criteria

1. Can construct a `DocSet` from the fake corpus (59 docs) and run a linear plan through the executor.
2. `filter_metadata` → `search_lex` → `top_k` chain works and produces correct document counts at each step.
3. A branching plan with `id`/`input` fields (two independent searches → `union` → `count`) executes correctly.
4. The executor rejects plans with unknown ops, forward references, or missing references with `PlanError`.
5. `StepTrace` array is populated with correct `input_count`, `output_count`, `duration_ms`, and `cost_usd: 0` for all steps.
6. `count(by: "sender")` on the full corpus returns `{ "Sarah Mitchell": 30, "David Mitchell": 29 }` (or close, based on fake data).

---

### Sprint 2 — LLM Operations + Planner + Synthesizer

**Goal:** Add all operations that call external APIs (embeddings and LLM), plus the two bookend LLM calls (planner and synthesizer). After this sprint, the engine can execute any plan from the spec — including labeling, extraction, and synthesis.

**Depends on:** Sprint 1 (types, DocSet, executor, registry all exist).

#### Deliverables

| File | What it does |
|---|---|
| `server/engine/ops/tier2/search-semantic.ts` | Embed the query via OpenAI embeddings API, compute cosine similarity against doc embeddings. For the POC: embed docs on first call and cache in memory. Return top K above threshold. Cost: ~$0.002/call. |
| `server/engine/ops/tier2/cluster.ts` | Group docs by embedding similarity. POC approach: use k-means over doc embeddings with LLM-generated cluster labels. Cost: ~$0.005/call. |
| `server/engine/ops/tier3/label.ts` | Classify docs by schema (`tone`, `topic`, `commitment`, `violation`, or custom string). Batch 10–20 docs per LLM call. Use `gpt-5-nano` for tone/topic, `gpt-5-mini` for complex schemas. Attach results to `DocSet.labels`. Uses Responses API with structured output for reliable JSON. |
| `server/engine/ops/tier3/extract.ts` | Pull structured fields from docs. Returns spans with start/end positions. Uses `gpt-5-mini`. Structured output schema varies by extraction type. |
| `server/engine/ops/tier3/filter-by-label.ts` | Parse the condition string (`tone == hostile AND confidence > 0.7`) and filter the DocSet's labels. No LLM call — pure logic. Throws if referenced schema hasn't been applied. Includes a simple condition parser (comparisons + AND/OR, AND binds tighter). |
| `server/engine/ops/tier3/timeline.ts` | Extract events from docs, order chronologically. Single LLM call over the full doc set (not per-doc). Structured output: `{ events: TimelineEvent[], summary: string }`. |
| `server/engine/planner.ts` | `generatePlan(query, corpusSummary, ctx)` — one LLM call that outputs a `PlanStep[]`. Adapt the existing prompt from `server/api/dev/generate-plan.post.ts` but output the spec-compliant `PlanStep` schema (with `id`, `input`, `rationale`, `estimated_cost`). Model: `gpt-5-mini` with `reasoning.effort: "high"`. Uses Responses API with `text.format: json_schema`. |
| `server/engine/synthesizer.ts` | `synthesize(query, finalDocSet, trace, ctx)` — one LLM call that receives the query, surviving documents, their labels, and the execution trace. Outputs prose with inline citations. Model: `gpt-5-mini`. Uses Responses API with structured output for the citation format. |

#### LLM call patterns (all use Responses API)

All LLM calls follow the same pattern — use `openai.responses.create()` (not chat completions):

```typescript
const response = await openai.responses.create({
  model: 'gpt-5-nano',           // or 'gpt-5-mini' depending on op
  instructions: systemPrompt,     // replaces the "system" role
  input: userContent,             // the documents / query
  reasoning: { effort: 'low' },   // 'low' for simple classification, 'high' for planning
  text: {
    format: {
      type: 'json_schema',
      name: 'label_result',
      strict: true,
      schema: { ... }
    }
  },
  store: false                    // don't persist responses server-side
})
const result = JSON.parse(response.output_text)
```

- **Planner:** `gpt-5-mini`, `reasoning.effort: "high"`, structured output for `PlanStep[]`.
- **Label (tone/topic):** `gpt-5-nano`, `reasoning.effort: "low"`, structured output per batch.
- **Label (commitment/violation):** `gpt-5-mini`, `reasoning.effort: "medium"`.
- **Extract:** `gpt-5-mini`, `reasoning.effort: "medium"`, structured output with spans.
- **Timeline:** `gpt-5-mini`, `reasoning.effort: "medium"`, structured output for events.
- **Synthesizer:** `gpt-5-mini`, `reasoning.effort: "medium"`, structured output for answer + citations.

#### Budget enforcement

- Before each Tier 2/3 op executes, it estimates cost and calls `ctx.budget.check(estimate)`.
- Cost estimation: Tier 2 ops have fixed estimates. Tier 3 ops estimate based on `docSet.docs.length * cost_per_doc`.
- If `check()` throws `BudgetExceededError`, the executor catches it, records the failure in the trace, and returns partial results.
- The `label` op respects its own `budget` arg as a per-step cap in addition to the global budget.

#### Retry logic

- Tier 3 ops wrap the OpenAI call in a try/catch. On API error, retry once after a 1-second delay.
- On second failure, mark the step as failed in the trace and return the input DocSet unchanged (skip the step, don't crash the pipeline).

#### Acceptance criteria

1. `label(schema: "tone")` on 10 docs produces a DocSet with tone labels on all 10 docs. Labels have `value`, `confidence`, `rationale`, and `key_phrases`.
2. `filter_by_label(condition: "tone == hostile AND confidence > 0.7")` correctly filters a labeled DocSet.
3. `search_semantic(query: "scheduling disputes", k: 10)` returns relevant docs from the corpus.
4. `generatePlan("Find hostile messages about scheduling")` returns a valid `PlanStep[]` that the executor can run.
5. `synthesize()` produces a prose answer with citations referencing actual doc IDs.
6. A full plan with Tier 1 → Tier 3 chain executes end-to-end and returns an `ExecutionResult`.
7. Budget enforcement: a plan that would exceed $0.01 budget throws `BudgetExceededError` and returns partial results with trace.
8. LLM retry: if the first API call fails, the op retries once. On second failure, the step is skipped and the trace records the error.

---

### Sprint 3 — API Integration + End-to-End Wiring

**Goal:** Wire the engine into the live Nuxt API layer. Replace the fake query endpoint with real engine execution. The UI's existing query page works against the real engine with no frontend changes (the response shape matches `QueryResult` from `~/types`).

**Depends on:** Sprint 1 + Sprint 2 (full engine exists).

#### Deliverables

| File | What it does |
|---|---|
| `server/engine/index.ts` | Barrel export. Public API: `runQuery(query: string, corpus: SiftDocument[], options?: QueryOptions): Promise<QueryResult>`. This is the single entry point that orchestrates plan → execute → synthesize. |
| `server/api/query/run.post.ts` | **Replace** the existing fake implementation. Accept `{ query: string, budget?: number }`. Load corpus (from fake data for now — real corpus loading is a separate feature). Call `runQuery()`. Return `QueryResult` matching the existing type contract. |
| `server/api/query/plan.post.ts` | **New endpoint** — returns just the plan without executing it. For the UI to show "here's what I'd do" before spending money. Accept `{ query: string }`. Return `{ plan: PlanStep[], estimated_cost: number }`. |
| `server/api/query/trace.get.ts` | **New endpoint** — returns the trace from the most recent execution (cached in memory or by execution ID). For the UI to render the pipeline visualization. |

#### Integration contract

The response from `run.post.ts` must match the existing `QueryResult` type so the UI doesn't break:

```typescript
interface QueryResult {
  answer: string
  citations: { doc_id: string; message_number?: number; preview: string }[]
  execution_plan: ExecutionStep[]   // Map StepTrace → ExecutionStep for the UI
  total_cost: number
  documents_touched: number
}
```

Mapping logic:
- `StepTrace` → `ExecutionStep`: map `step.op` → `op`, infer `tier` from the registry (or a static tier map), `step.args` → `args`, `output_count` → `result_count`, `cost_usd` → `cost`, `duration_ms` → `duration_ms`, status is always `"complete"` (or `"error"` if the step failed).
- `answer` comes from the synthesizer output.
- `citations` come from the synthesizer's structured output, enriched with `message_number` and `preview` from the corpus.
- `documents_touched` = `ctx.trace[0].input_count` (the corpus size at entry).

#### Cleanup

- Move the existing `generate-plan.post.ts` logic into `planner.ts` (Sprint 2) and deprecate the dev endpoint, or keep it as a thin wrapper that calls the engine's planner.
- The `label-tone.post.ts` and `extract-events.post.ts` dev endpoints can remain as standalone dev tools — they're useful for testing individual ops outside the full pipeline.

#### Error handling at the API layer

| Scenario | Behavior |
|---|---|
| Empty query | 400 with message |
| Planner LLM call fails | 502 with `{ error: "Planning failed", detail: ... }` |
| Budget exceeded during execution | 200 with partial results + `budget_exceeded: true` flag + trace showing where it stopped |
| Individual step fails | 200 with results from completed steps. Failed step shows in trace with `status: "error"`. Synthesizer works with whatever docs survived. |
| Synthesizer fails | 200 with raw results (no prose answer). `answer` field contains a fallback: "Synthesis unavailable. Found N documents matching your query." Citations still included. |

#### Acceptance criteria

1. `POST /api/query/run` with `{ query: "Find hostile messages about scheduling" }` returns a real `QueryResult` with a prose answer, citations pointing to real doc IDs, and a populated execution trace.
2. The execution trace shows realistic step counts (e.g., 59 → 18 → 26 → 9 docs through the pipeline).
3. `total_cost` is non-zero and reflects actual LLM token usage.
4. `POST /api/query/plan` returns a plan without executing it — no LLM calls beyond the planner.
5. The existing query UI page (`pages/query.vue`) works without any frontend changes — the response shape is identical.
6. Budget exceeded scenario: `{ query: "...", budget: 0.001 }` returns partial results with the `budget_exceeded` flag.
7. Full round-trip latency for a simple query (e.g., keyword search + count) is under 3 seconds. Complex queries (with labeling) under 15 seconds.

---

### Sprint Dependency Graph

```
Sprint 1                    Sprint 2                    Sprint 3
─────────                   ─────────                   ─────────
types.ts ──────────────────→ planner.ts ───────────────→ index.ts (barrel)
errors.ts                    synthesizer.ts              run.post.ts (replace)
docset.ts ─────────────────→ tier2/ ops                  plan.post.ts (new)
executor.ts ───────────────→ tier3/ ops                  trace.get.ts (new)
registry.ts ───────────────→ (ops register themselves)   cleanup dev endpoints
tier1/ ops (8 files)         budget enforcement
structural/ ops (2 files)    retry logic
```

Sprint 1 is **pure logic** — no API keys, no network calls, no flaky tests. Sprint 2 introduces **external dependencies** (OpenAI API) but the engine internals are already solid. Sprint 3 is **integration** — the riskiest part is making sure the response shape matches what the UI expects, and that's a straightforward mapping.
