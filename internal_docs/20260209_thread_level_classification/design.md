# Thread-Level Classification — Design & Implementation Plan

## The Problem

The execution engine currently treats every document as an isolated message. Tier 3 ops (`label`, `extract`, `timeline`) classify or extract from individual messages without seeing the surrounding conversation. This produces bad plans for a large class of real queries.

**Example:** "Find all expense-related disagreements over $200."

The current planner generates something like:

1. `search_regex` — try to match dollar amounts >$200 with a regex pattern
2. `search_semantic` — find disagreement language in the regex survivors
3. `label` — confirm the remaining messages are expense-related
4. `filter_by_label` — keep high-confidence matches

This is structurally broken. The regex step is brittle (misses "two-fifty", "the full amount", references to amounts stated earlier in the thread) and filters out ~99.7% of the corpus on step 1. Most actual results are thrown away before the LLM ever sees them. And even when messages survive to step 3, the `label` op classifies each message in isolation — it can't see that "that's ridiculous" is a response to a $350 tutoring bill mentioned three messages earlier.

**The root cause:** disagreements, commitments, violations, and most interesting patterns are *conversational*. They live in the back-and-forth between messages, not in any single message. A human reviewing these threads would read the entire exchange, form a judgment about the thread, and then cite specific messages. The engine should work the same way.

---

## The Design

### Core Change: `unit` Parameter on Tier 3 Ops

The `label` and `extract` ops gain a `unit` parameter:

```
unit: "message" | "thread"    — Default: "message" (backward compatible)
```

When `unit: "thread"`:

1. **Group** the input DocSet's messages by `thread_id`.
2. **Render** each thread as a single formatted block — messages in chronological order with clear markers for message ID, sender, timestamp.
3. **One LLM call per thread** instead of batching messages across threads.
4. **Labels propagate back to all messages in the thread**, so downstream ops (`filter_by_label`, `count`, etc.) continue to work at the message level with no changes.
5. **Message-level citations are preserved** — the LLM is instructed to reference specific message IDs in its rationale and key_phrases output.

The DocSet remains message-based. No new "ThreadSet" abstraction. Thread-level ops are a smarter way of *producing* labels, not a different data model.

### Why Not a Separate `label_threads` Op?

Adding `unit` to the existing ops is cleaner:

- **Composability is preserved.** A thread-level `label` still returns a DocSet with labels on messages. Every downstream op works unchanged.
- **The planner makes one decision** (message vs. thread) rather than choosing between two different ops.
- **The cost model stays uniform.** Thread-level labeling is still `label` — it just has different cost characteristics (fewer calls, more tokens per call).

### Thread Rendering Format

When `unit: "thread"`, each thread is rendered for the LLM like this:

```
THREAD: thread-005 (4 messages)
════════════════════════════════

[msg-014] Sarah Mitchell — 2025-03-12 09:15
The tutoring center sent the bill — $350 for this month.

[msg-015] David Mitchell — 2025-03-12 10:02
That seems high. What happened to the $200/month place?

[msg-016] Sarah Mitchell — 2025-03-12 10:30
He needed more sessions after the math test. This is what it costs.

[msg-017] David Mitchell — 2025-03-12 11:45
You can't just unilaterally double the cost without discussing it.

════════════════════════════════
```

Key details:
- Message IDs are prominent so the LLM can reference them.
- Sender names and timestamps are included for context.
- Messages are chronologically ordered within the thread.
- The full message text is included (no truncation). Modern context windows handle this trivially — even a 200-message thread is a few thousand tokens.

### Label Output Shape (Thread-Level)

When classifying at thread level, the LLM returns a richer structure:

```typescript
// Existing message-level label (unchanged)
interface MessageLabel {
  value: string
  confidence: number
  rationale: string
  key_phrases: string[]
}

// New thread-level label
interface ThreadLabel {
  value: string | boolean | number    // The classification result
  confidence: number
  rationale: string
  cited_messages: string[]             // Message IDs the judgment is based on
  key_phrases: string[]                // Specific quotes from the thread
}
```

The `cited_messages` field is what makes thread-level classification precise. The LLM says "this thread is an expense disagreement" *and* points to the specific messages that constitute the disagreement. This feeds directly into the synthesizer for citation-backed answers.

### Label Propagation

When a thread-level label is produced, it gets attached to **every message in that thread** in the DocSet's label map. This means:

- `filter_by_label(condition: "expense_disagreement == true")` keeps all messages from threads classified as expense disagreements.
- `count(by: "topic")` counts messages (not threads), but the counts reflect thread-level judgments.
- The `cited_messages` field is available in the label metadata for downstream ops that want precision (e.g., the synthesizer can cite specific messages instead of entire threads).

If the downstream use case wants thread-level counts, a `count(by: "thread")` already exists and works naturally — it groups by `thread_id` and counts unique threads.

### Custom Schemas at Thread Level

Thread-level classification is most powerful with custom/compound schemas. Instead of the predefined `"tone"` or `"topic"` schemas, the planner can define a query-specific schema:

```json
{
  "op": "label",
  "args": {
    "schema": "Does this thread contain a disagreement about an expense over $200? Return the disputed amount if applicable.",
    "unit": "thread"
  }
}
```

The `label` op detects that the schema is a natural-language string (not a predefined key like `"tone"`) and constructs a classification prompt from it. The structured output schema adapts:

```json
{
  "matches": true,
  "disputed_amount": 350,
  "confidence": 0.92,
  "rationale": "Sarah presents a $350 tutoring bill in msg-014. David objects to the cost increase in msg-015 and msg-017, calling it a unilateral decision.",
  "cited_messages": ["msg-014", "msg-015", "msg-017"]
}
```

This is where the real power is. The planner doesn't need to decompose "expense disagreement over $200" into three separate ops (regex for amount, semantic search for disagreement, label for topic). It asks one compound question per thread and gets one compound answer.

---

## How the Original Query Gets Solved

**Query:** "Find all expense-related disagreements over $200."

### Old Plan (4 steps, brittle, bad recall)

```json
[
  { "op": "search_regex", "args": { "pattern": "..." } },
  { "op": "search_semantic", "args": { "query": "expense disagreement..." } },
  { "op": "label", "args": { "schema": "topic" } },
  { "op": "filter_by_label", "args": { "condition": "topic == 'expenses' AND confidence > 0.6" } }
]
```

Problems: Regex kills recall. Semantic search operates on scraps. Label classifies messages in isolation. The pipeline can't answer the actual question.

### New Plan (2 steps, accurate, uses thread context)

```json
[
  {
    "op": "label",
    "args": {
      "schema": "Does this thread contain a disagreement about an expense or cost exceeding $200? Identify the disputed amount and the nature of the disagreement.",
      "unit": "thread"
    },
    "rationale": "Classify each thread holistically. The LLM needs to see the full exchange to determine whether a disagreement exists and what amount is disputed — these details often span multiple messages."
  },
  {
    "op": "filter_by_label",
    "args": {
      "condition": "matches == true AND confidence > 0.6"
    }
  }
]
```

This works because:
- The LLM sees complete threads and can follow conversational references ("that's too much" → referring to the $350 bill three messages ago).
- Dollar amounts don't need to be regex-matchable — the LLM understands "two-fifty", "the full amount", and implicit references.
- The disagreement detection is contextual — the LLM can distinguish "we need to pay the $300 bill" (agreement) from "you can't just spend $300 without asking me" (disagreement).
- Cost is proportional to number of threads, not number of messages. If you have 500 messages across 40 threads, you make ~40 LLM calls instead of ~50 batched message calls, and each call is dramatically more accurate.

---

## Cost Implications

Thread-level classification changes the cost model:

| Dimension | Message-level | Thread-level |
|---|---|---|
| Number of LLM calls | `ceil(n_messages / batch_size)` | `n_threads` |
| Tokens per call | ~batch_size × avg_message_length | ~thread_length (all messages) |
| Total tokens | ~same | ~same (slightly more due to per-thread formatting overhead) |
| Accuracy | Low for conversational queries | High |
| Cost per call | Lower (smaller input) | Higher (larger input) |
| Total cost | Similar | Similar, sometimes lower (fewer calls = less per-call overhead) |

The total token count is roughly equivalent — you're sending the same text to the LLM either way. The difference is how it's grouped. Thread-level grouping produces vastly better results for the same token spend because the LLM has context.

For very long threads (100+ messages), cost per thread could be significant. The implementation should support a `max_thread_tokens` argument that truncates or samples within a thread if needed, but for the POC this isn't a concern — OFW threads are typically 5-30 messages.

---

## Planner Prompt Changes

The planner prompt needs to teach the LLM when to use `unit: "thread"` vs. `unit: "message"`. Add to the planner's operation reference:

```
The `label` and `extract` ops accept a `unit` argument: "message" or "thread".

Use unit: "thread" when:
- The query involves relationships between messages (disagreements, escalation,
  promises followed by broken promises, tone shifts over time)
- The query references concepts that span multiple messages (expense disputes
  where the amount is stated in one message and contested in another)
- The query asks about conversational dynamics (who initiated, who escalated,
  whether there was resolution)
- The classification requires context that a single message doesn't provide

Use unit: "message" when:
- The query is about properties of individual messages (messages containing
  specific keywords, messages with hostile tone in isolation)
- The corpus isn't conversational (standalone documents, not threaded exchanges)
- You need per-message granularity and thread context isn't relevant

Default to "thread" for most queries involving this corpus. Co-parenting
messages are inherently conversational — most interesting patterns live in
the exchange, not in isolated messages.
```

Additionally, update the planner guidance on deterministic-first filtering:

```
IMPORTANT: Prefer deterministic narrowing (Tier 1 ops) only when the filter
has high recall for the target concept. Regex and keyword filters work well for
structured patterns (specific names, dates, exact phrases). They work poorly for
fuzzy concepts (disagreements, tone, implicit dollar amounts, emotional content).

If the concept is inherently conversational or fuzzy, skip directly to
thread-level LLM classification. A free operation that destroys recall is
worse than an LLM operation that gets the right answer.
```

---

## Implementation Plan

This builds on the existing Sprint 2 deliverables. Thread-level support is an enhancement to the `label` and `extract` ops, not a new sprint.

### Step 1: Thread Grouping Utility

**File:** `server/engine/utils/thread-grouper.ts`

A utility function that takes a DocSet and returns messages grouped by thread:

```typescript
interface ThreadGroup {
  thread_id: string
  messages: SiftDocument[]      // Chronologically ordered
  rendered: string              // Formatted text block for LLM consumption
  message_ids: string[]         // For quick lookup
}

function groupByThread(docSet: DocSet, corpus: SiftDocument[]): ThreadGroup[]
```

Key behavior:
- Groups messages in the DocSet by `thread_id`.
- Sorts messages within each thread by `timestamp`.
- Pulls in **all messages in a thread from the corpus**, not just those in the current DocSet. This is critical — if a filter narrowed the DocSet to 10 messages across 3 threads, the LLM should still see the complete threads for context. The DocSet messages determine *which threads* to classify, but the LLM sees the full thread.
- Renders each thread into the formatted text block described above.

### Step 2: Update `label` Op

**File:** `server/engine/ops/tier3/label.ts`

Add the `unit` parameter. When `unit: "thread"`:

1. Call `groupByThread(docSet, ctx.corpus)` to get thread groups.
2. For each thread group, make one LLM call with the rendered thread as input.
3. Parse the structured output (which now includes `cited_messages`).
4. Propagate the thread-level label to all messages in the thread that are in the current DocSet.
5. Store the `cited_messages` metadata alongside the label for downstream use.

The structured output schema needs to be dynamically generated based on the schema argument:
- Predefined schemas (`"tone"`, `"topic"`) get predefined JSON schemas adapted for thread-level input.
- Custom string schemas get a generic classification schema with `matches`, `confidence`, `rationale`, `cited_messages`, and an extensible `details` field.

**Cost estimation** changes: estimate based on `n_threads * avg_thread_tokens * cost_per_token` instead of `n_messages * cost_per_message`.

### Step 3: Update `extract` Op

**File:** `server/engine/ops/tier3/extract.ts`

Same pattern as `label`. When `unit: "thread"`:

1. Group by thread, render full thread context.
2. One extraction call per thread.
3. Extracted spans still reference individual message IDs and positions within those messages.
4. The LLM sees the full thread but extracts structured data from specific messages.

This is particularly useful for schemas like `"commitments"` and `"violations"` — a commitment in one message and a violation in a later message are only identifiable with thread context.

### Step 4: Update Planner Prompt

**File:** `server/engine/planner.ts`

Add the planner guidance described above. The planner should:
- Default to `unit: "thread"` for most classification queries on this corpus type.
- Use custom compound schemas instead of decomposing queries into brittle multi-step chains.
- Only use deterministic pre-filtering when it has high recall for the target concept.

### Step 5: Update Synthesizer

**File:** `server/engine/synthesizer.ts`

The synthesizer already receives labels and documents. With thread-level labels, it also gets `cited_messages` fields. Update the synthesizer prompt to:
- Use `cited_messages` from thread-level labels as primary citation sources.
- Present results grouped by thread when the classification was thread-level.
- Include the thread context when explaining why a result matched.

---

## What Doesn't Change

- **DocSet stays message-based.** No ThreadSet, no new data model.
- **Tier 1 and Tier 2 ops are unchanged.** `filter_metadata`, `search_lex`, `search_semantic`, etc. continue to work at message level. They're still useful for narrowing *which threads* get classified.
- **`filter_by_label` is unchanged.** It filters messages by their labels. Thread-level labels are just labels that happen to be attached to all messages in a thread.
- **The executor is unchanged.** It still runs a forward loop over plan steps. Thread grouping is internal to the ops.
- **The trace/UI is unchanged.** Thread-level ops still report `input_count` (messages in), `output_count` (messages out), `cost_usd`, and `duration_ms`. The detail field can include `threads_classified: N` for additional visibility.

---

## Future Considerations

**Pre-computed thread-level labels at ingest time.** If certain schemas (tone, topic) are always useful, run thread-level classification during ingest and store the results. Then queries can filter on pre-computed labels at Tier 1 cost. This is noted in the vision doc as "pre-computed labels at ingest" and thread-level classification makes it even more valuable.

**Thread summarization as a cached intermediate.** For very long threads, a summarization step could produce a compressed thread representation that's cheaper to classify. Not needed for the POC but useful at scale.

**Mixed-unit plans.** A plan could use thread-level `label` for the main classification and then message-level `extract` on the surviving messages for fine-grained span extraction. The ops compose naturally since the DocSet is always message-based.

**Thread-level `timeline`.** The `timeline` op already operates on sets of messages, but explicitly grouping by thread before event extraction could produce better timelines — each thread becomes a potential event source with full context.
