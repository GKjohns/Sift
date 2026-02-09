# Thread-Level Classification — Implementation Plan

## Overview

This plan adds thread-level classification to the execution engine's Tier 3 ops (`label`, `extract`). It slots into Sprint 2 of the initial implementation plan — the `label` and `extract` ops haven't been built yet, so thread-level support is baked in from the start rather than retrofitted.

See `design.md` in this folder for the full rationale, data model decisions, and before/after query comparison.

**Depends on:** Sprint 1 complete (types, DocSet, executor, registry, all Tier 1 + structural ops).

---

## Deliverables

### New Files

| File | What it does |
|---|---|
| `server/engine/utils/thread-grouper.ts` | **[✅ Completed]** Groups a DocSet's messages by `thread_id`, pulls full thread context from the corpus, renders each thread into a formatted text block for LLM consumption. Returns `ThreadGroup[]`. |
| `server/engine/types.ts` (update) | **[✅ Completed]** Add `ThreadLabel` interface alongside existing `Labels`. Add `ThreadGroup` type. Add `unit` to the args type documentation for `label` and `extract`. |

### Modified Files (Sprint 2 ops — build with thread support from day one)

| File | What changes |
|---|---|
| `server/engine/ops/tier3/label.ts` | **[✅ Completed]** Accepts `unit: "message" \| "thread"` arg. When `"thread"`: groups by thread via `thread-grouper`, one LLM call per thread, propagates labels to all thread messages in the DocSet. Handles both predefined schemas and custom natural-language schemas. |
| `server/engine/ops/tier3/extract.ts` | **[✅ Completed]** Same `unit` parameter. When `"thread"`: groups by thread, extracts structured fields with thread context, spans still reference individual message IDs and positions. |
| `server/engine/planner.ts` | **[✅ Completed]** Planner prompt includes guidance on when to use `unit: "thread"` vs `"message"`. Includes the deterministic-filter recall warning. Teaches custom compound schemas. |
| `server/engine/synthesizer.ts` | **[✅ Completed]** Reads `cited_messages` from thread-level labels for precise citations. Groups results by thread when classification was thread-level. |

---

## Step-by-Step

### Step 1 — Thread Grouper Utility **[✅ Completed]**

**File:** `server/engine/utils/thread-grouper.ts`

```typescript
interface ThreadGroup {
  thread_id: string
  messages: SiftDocument[]      // All messages in the thread (from corpus), chronologically ordered
  docset_message_ids: Set<string>  // Which of these messages are in the current DocSet
  rendered: string              // Formatted block for LLM input
  token_estimate: number        // Rough token count for cost estimation
}

function groupByThread(docSet: DocSet, corpus: SiftDocument[]): ThreadGroup[]
function renderThread(group: ThreadGroup): string
```

**Behavior:**

1. Collect unique `thread_id` values from the DocSet's messages.
2. For each thread ID, pull **all** messages with that thread ID from `ctx.corpus` — not just the ones in the DocSet. The DocSet determines *which threads* to classify; the corpus provides *full context*.
3. Sort messages within each thread by `timestamp` ascending.
4. Render each thread using the format from `design.md`:
   ```
   THREAD: thread-005 (4 messages)
   ════════════════════════════════

   [msg-014] Sarah Mitchell — 2025-03-12 09:15
   The tutoring center sent the bill — $350 for this month.

   ...
   ════════════════════════════════
   ```
5. Estimate token count per thread: `ceil(rendered.length / 4)` (rough chars-to-tokens heuristic). This feeds into cost estimation.

**Key decision:** Full corpus context, not filtered context. If a `filter_metadata(sender: "Sarah Mitchell")` narrowed the DocSet to Sarah's messages only, and those messages span 3 threads, the LLM still sees David's messages in those threads. The filter determined *which threads are relevant*, but the LLM needs both sides of the conversation to classify accurately.

### Step 2 — `label` Op with Thread Support **[✅ Completed]**

**File:** `server/engine/ops/tier3/label.ts`

The `label` op handles two modes in a single implementation:

**Message mode** (`unit: "message"` or omitted — backward compatible):
- Existing behavior from the Sprint 2 spec. Batch 10–20 messages per LLM call.
- Predefined schemas (`"tone"`, `"topic"`, etc.) use predefined structured output schemas.
- Custom string schemas use a generic classification schema.

**Thread mode** (`unit: "thread"`):
1. Call `groupByThread(docSet, ctx.corpus)`.
2. For each `ThreadGroup`, construct the LLM prompt:
   - System prompt describes the classification task and output format.
   - User content is the rendered thread.
   - Structured output schema includes `cited_messages: string[]` and `rationale: string` alongside the schema-specific fields.
3. One `openai.responses.create()` call per thread.
4. Parse the response. Propagate the label to every message in the thread that's in the current DocSet (using `docset_message_ids` from the ThreadGroup).
5. Store `cited_messages` in the label metadata.

**Structured output schemas by mode:**

For predefined schemas at thread level, adapt the existing schema to include thread-level fields:

```typescript
// Thread-level tone schema
{
  overall_tone: "hostile" | "neutral" | "cooperative",
  confidence: number,
  rationale: string,
  cited_messages: string[],
  tone_shifts: Array<{ message_id: string, tone: string, trigger: string }>  // optional enrichment
}

// Thread-level topic schema  
{
  primary_topic: string,
  confidence: number,
  rationale: string,
  cited_messages: string[],
  secondary_topics: string[]
}
```

For custom natural-language schemas (the compound query case), use a generic schema:

```typescript
{
  matches: boolean,
  confidence: number,
  rationale: string,
  cited_messages: string[],
  details: Record<string, any>  // schema-specific fields the LLM populates
}
```

The `details` field is where the LLM puts query-specific data — `disputed_amount`, `violation_type`, `commitment_text`, whatever the custom schema asks for. The planner tells the LLM what to ask; the label op doesn't need to know in advance.

**Cost estimation:**
- Message mode: `n_messages * cost_per_message` (unchanged).
- Thread mode: `sum(thread.token_estimate * cost_per_token for thread in groups)`. Uses the token estimates from the thread grouper.

**Model selection:**
- Predefined schemas (tone, topic): `gpt-5-nano`, `reasoning.effort: "low"`. Same as message mode.
- Custom schemas and complex predefined schemas (commitment, violation): `gpt-5-mini`, `reasoning.effort: "medium"`.
- Thread mode doesn't change the model — it changes the input shape.

### Step 3 — `extract` Op with Thread Support **[✅ Completed]**

**File:** `server/engine/ops/tier3/extract.ts`

Same pattern as `label`. The `unit: "thread"` mode:

1. Groups by thread via `thread-grouper`.
2. One extraction call per thread.
3. The structured output includes spans that reference individual message IDs:
   ```typescript
   {
     extractions: Array<{
       message_id: string,
       field: string,           // e.g. "commitment", "violation", "financial_amount"
       value: string,
       span: { start: number, end: number },  // position within the specific message
       confidence: number,
       context: string          // why this was extracted (references to other messages)
     }>
   }
   ```
4. Extractions are attached to the DocSet per individual message (not per thread), so downstream ops work unchanged.

**Why thread context matters for extraction:** The `"commitments"` schema needs to see "I'll register him today" (msg-042) *and* the request it responds to (msg-041) to understand what was committed. The `"violations"` schema needs to see a commitment in one message and a broken promise in a later message. These are fundamentally cross-message patterns.

### Step 4 — Planner Prompt Updates **[✅ Completed]**

**File:** `server/engine/planner.ts`

Three additions to the planner's system prompt:

**A. Operation reference update** — Add `unit` parameter documentation to the `label` and `extract` entries:

```
label:
  schema: "tone" | "topic" | "commitment" | "violation" | <custom string>
  unit: "message" | "thread"    (default: "message")
  budget?: number

  When unit is "thread", the op classifies entire conversation threads
  rather than individual messages. The LLM sees the full back-and-forth
  and can identify patterns that span multiple messages. Labels are
  propagated to all messages in classified threads. The LLM returns
  cited_messages listing which specific messages support its judgment.
```

**B. Thread vs. message guidance** — New section in the planner prompt:

```
## Choosing message vs. thread classification

Default to unit: "thread" for this corpus. Co-parenting messages are
conversational — most patterns of interest (disagreements, commitments,
violations, escalation) exist in the exchange between messages, not in
any single message.

Use unit: "message" only when:
- The query targets individual message properties (keyword presence,
  message length, sender-specific patterns)
- The corpus is non-conversational (standalone documents)
- Per-message granularity is explicitly needed

When using unit: "thread", prefer custom compound schemas over
multi-step decomposition. Instead of:
  search_regex(amount) → search_semantic(disagreement) → label(topic)
Write:
  label(schema: "expense disagreement over $200", unit: "thread")

The LLM can answer compound questions in a single pass when it has
full thread context. Decomposing into multiple steps adds fragility
without improving accuracy.
```

**C. Deterministic filter recall warning** — Add to the existing planning guidelines:

```
## When NOT to use deterministic pre-filtering

Tier 1 ops (regex, keyword, metadata filters) are free and fast, but
they only help when they have HIGH RECALL for the target concept.

Good candidates for Tier 1 pre-filtering:
- Specific sender names → filter_metadata
- Date ranges → filter_metadata
- Exact phrases or keywords → search_lex
- Well-structured patterns (email addresses, URLs) → search_regex

Bad candidates for Tier 1 pre-filtering:
- Dollar amounts in natural language (people say "two-fifty", "the full
  amount", or reference amounts from earlier messages)
- Emotional tone or sentiment
- Disagreements, conflicts, escalation
- Implicit references ("that expense", "what you spent")

If the target concept is fuzzy, conversational, or frequently expressed
indirectly, skip Tier 1 and go straight to thread-level LLM classification.
A free filter that destroys 90% of relevant results is not saving money —
it's producing wrong answers.
```

### Step 5 — Synthesizer Updates **[✅ Completed]**

**File:** `server/engine/synthesizer.ts`

The synthesizer receives the final DocSet (with labels) and the execution trace. With thread-level labels, two things change:

**A. Citation precision.** Thread-level labels include `cited_messages` arrays. The synthesizer prompt should use these for citations instead of citing all messages in a matching thread:

```
When constructing citations, prefer the `cited_messages` field from
thread-level labels. These are the specific messages the classifier
identified as supporting its judgment. Cite those messages, not every
message in the thread.
```

**B. Thread-grouped presentation.** When results come from thread-level classification, the synthesizer should present results grouped by thread rather than as a flat list of messages:

```
When results were classified at thread level, group your findings by
thread. For each matching thread:
1. State the thread-level finding (e.g., "Thread 5 contains an expense
   disagreement over $350")
2. Cite the key messages that support this finding
3. Briefly describe the exchange

This is more natural for the reader — they want to understand what
happened in each conversation, not see a list of isolated messages.
```

---

## Types Changes **[✅ Completed]**

Update `server/engine/types.ts` with the following additions:

```typescript
// Add to existing Labels interface
interface ThreadLabelMeta {
  unit: "thread"
  thread_id: string
  cited_messages: string[]
}

// Extend the label value type to optionally carry thread metadata
interface Labels {
  tone?: { value: ToneLabel; confidence: number; rationale: string; key_phrases: string[]; thread_meta?: ThreadLabelMeta }
  topic?: { value: string; confidence: number; thread_meta?: ThreadLabelMeta }
  commitment?: { value: string; confidence: number; spans: Span[]; thread_meta?: ThreadLabelMeta }
  violation?: { value: string; confidence: number; spans: Span[]; thread_meta?: ThreadLabelMeta }
  [custom: string]: { value: any; confidence: number; thread_meta?: ThreadLabelMeta; [key: string]: any } | undefined
}
```

The `thread_meta` field is optional — present when the label was produced by a thread-level op, absent for message-level labels. Downstream ops don't need to check it; it's metadata for the synthesizer and UI.

---

## Key Decisions

- **Full corpus context for threads.** When `unit: "thread"`, the thread grouper pulls all messages in a thread from the corpus, not just those in the current DocSet. A `filter_metadata(sender: "Sarah")` might narrow the DocSet to Sarah's messages, but the LLM still sees David's replies. The filter determines *which threads* are relevant; the LLM sees complete conversations.

- **Labels propagate to all DocSet messages in the thread.** If the DocSet contains messages 14, 16, and 19 from thread-005, and the thread is classified as an expense disagreement, all three messages get the label. This is consistent with how thread-level judgments work — if the thread is about expenses, all messages in it are part of that expense conversation.

- **`cited_messages` is metadata, not a filter.** The label is attached to all messages in the thread, but `cited_messages` tells the synthesizer *which messages to cite* in the answer. This separation keeps `filter_by_label` simple (it doesn't need to understand citations) while giving the synthesizer precision.

- **Custom schemas use a generic output shape.** The `matches` + `confidence` + `rationale` + `cited_messages` + `details` structure is flexible enough for any query the planner can construct. The planner describes what to look for in natural language; the label op wraps it in a structured output schema; the LLM fills in the blanks. No need to predefine schemas for every possible query.

- **No changes to the executor, DocSet, or downstream ops.** Thread-level classification is entirely contained within the `label` and `extract` ops. The rest of the engine doesn't know or care whether a label came from message-level or thread-level classification. This minimizes the blast radius.

- **Thread mode doesn't batch across threads.** Unlike message mode (which batches 10-20 messages per LLM call), thread mode makes one call per thread. This is intentional — each thread is a self-contained classification task, and mixing threads in a single call would confuse the LLM and produce worse results. The cost difference is marginal (same total tokens, slightly more per-call overhead).

---

## Acceptance Criteria

1. `groupByThread()` correctly groups DocSet messages by thread, pulls full thread context from the corpus, and renders formatted thread blocks with message IDs, senders, and timestamps.

2. `label(schema: "tone", unit: "thread")` on a DocSet spanning 3 threads makes 3 LLM calls (one per thread) and produces labels on every message in those threads within the DocSet. Labels include `thread_meta` with `cited_messages`.

3. `label(schema: "custom question about expenses", unit: "thread")` works with a custom natural-language schema. The structured output includes `matches`, `confidence`, `rationale`, `cited_messages`, and `details`.

4. `filter_by_label` works identically on thread-produced labels — it filters messages by their label values, unaware of whether the label came from message or thread classification.

5. `extract(schema: "commitments", unit: "thread")` extracts commitments with thread context. A commitment in msg-042 that responds to a request in msg-041 is correctly extracted with both messages referenced.

6. The planner, given "Find all expense-related disagreements over $200", produces a 2-step plan using `label(unit: "thread")` with a custom schema + `filter_by_label`, NOT a multi-step regex → semantic → label chain.

7. The planner, given "Find messages from Sarah containing the word 'lawyer'", produces a plan using `filter_metadata` + `search_lex` (message-level ops) — does NOT use thread-level classification for simple keyword queries.

8. The synthesizer groups results by thread when thread-level labels are present. Citations reference specific `cited_messages` rather than all messages in matching threads.

9. Cost estimation for thread-level labels is based on `n_threads * avg_thread_tokens`, not `n_messages * cost_per_message`. The budget check uses the thread-based estimate.

10. A full end-to-end query with thread-level classification executes and returns a `QueryResult` with accurate citations, thread-grouped prose, and correct cost accounting.

---

## Sequencing Within Sprint 2

This work integrates into the Sprint 2 deliverables from the execution engine plan. The build order:

```
1. thread-grouper.ts           (pure utility, no dependencies beyond types)
2. label.ts                    (build with both message + thread modes from day one)
3. extract.ts                  (same dual-mode pattern)
4. filter-by-label.ts          (unchanged — operates on labels regardless of origin)
5. planner.ts                  (prompt includes thread guidance)
6. synthesizer.ts              (handles cited_messages and thread grouping)
```

The thread grouper is the only net-new file. Everything else is a modification to files that were already planned for Sprint 2. The additional effort is:

- **Thread grouper:** ~1 hour. Simple grouping + rendering logic.
- **Label thread mode:** ~2 hours on top of message mode. The LLM call pattern is the same; the input construction and label propagation differ.
- **Extract thread mode:** ~1 hour on top of message mode. Same pattern as label.
- **Planner prompt additions:** ~30 minutes. Three prompt sections to add.
- **Synthesizer updates:** ~1 hour. Citation handling and thread-grouped presentation.

**Total incremental effort over base Sprint 2: ~5-6 hours.**

The payoff is substantial — thread-level classification turns a class of queries from "fundamentally broken" to "accurate in two steps."
