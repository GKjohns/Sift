import type OpenAI from 'openai'

import type { SiftDocument } from '~/types'
import type { CorpusSummary, ExecContext, PlanStep, PlannerResult } from './types'

import { useOpenAI } from '../utils/openai'

// ── Corpus Summary Builder ───────────────────────────────────────────────────

export function buildCorpusSummary(corpus: SiftDocument[]): CorpusSummary {
  const senderCounts = new Map<string, number>()
  const threadIds = new Set<string>()
  let earliest = ''
  let latest = ''

  for (const doc of corpus) {
    const sender = doc.metadata.sender || 'Unknown'
    senderCounts.set(sender, (senderCounts.get(sender) ?? 0) + 1)

    if (doc.metadata.thread_id) threadIds.add(doc.metadata.thread_id)

    if (!earliest || doc.timestamp < earliest) earliest = doc.timestamp
    if (!latest || doc.timestamp > latest) latest = doc.timestamp
  }

  const senders = [...senderCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  return {
    total_documents: corpus.length,
    senders,
    date_range: { start: earliest, end: latest },
    has_tone_analysis: false,
    thread_count: threadIds.size
  }
}

// ── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(summary: CorpusSummary): string {
  const senderList = summary.senders.map(s => `${s.name} (${s.count} messages)`).join(', ')

  return `You are Sift's query planner. Your job is to decompose a natural language query about a document corpus into a sequence of operations that the execution engine will run.

## Corpus Context

- ${summary.total_documents} documents (OFW co-parenting messages)
- ${summary.thread_count} conversation threads
- Senders: ${senderList}
- Date range: ${summary.date_range.start} to ${summary.date_range.end}
- Pre-computed tone analysis: ${summary.has_tone_analysis ? 'yes' : 'no'}

## Available Operations

### TIER 1 — Free (deterministic, in-memory):
- filter_metadata(where) — Filter by sender, date range, thread_id, word_count, etc.
    Example args: { "sender": "Sarah Mitchell", "after": "2025-03-01" }
- search_lex(terms, mode) — Keyword search. Modes: "any", "all", "phrase".
    Example args: { "terms": ["lawyer", "court"], "mode": "any" }
- search_regex(pattern) — Regex over document text.
    Example args: { "pattern": "\\$\\d{2,}" }
- top_k(by, k) — Take top K docs by timestamp or relevance.
    Example args: { "by": "timestamp", "k": 20 }
- sample(n, strategy) — Random, stratified, or recent sample.
    Example args: { "n": 10, "strategy": "recent" }
- get_context(doc_id, window) — Surrounding docs for conversational context.
- count(by) — Count by sender, day, week, label, entity.
    Example args: { "by": "sender" }
- trend(metric, interval) — Metric over time.
    Example args: { "metric": "hostile", "interval": "week" }

### STRUCTURAL — Free (set operations):
- union — Merge multiple DocSets (used with branching plans).
- intersect — Keep only docs present in all inputs.

### TIER 3 — Expensive (LLM per document/thread):
- label(schema, unit, budget) — Classify documents or threads.
    schema: "tone" | "topic" | "commitment" | "violation" | <custom string>
    unit: "message" | "thread"    (default: "message")
    budget?: number

    When unit is "thread", the op classifies entire conversation threads
    rather than individual messages. The LLM sees the full back-and-forth
    and can identify patterns that span multiple messages. Labels are
    propagated to all messages in classified threads. The LLM returns
    cited_messages listing which specific messages support its judgment.

- extract(schema, unit) — Pull structured fields from docs or threads.
    schema: "commitments" | "violations" | "financial_amounts" | <custom string>
    unit: "message" | "thread"    (default: "message")

    When unit is "thread", extractions can reference cross-message patterns.
    Each extracted item still references a specific message_id and span.

- filter_by_label(condition) — Filter on LLM-generated labels.
    Example args: { "condition": "tone == hostile AND confidence > 0.7" }
    Condition syntax: comparisons joined by AND / OR. AND binds tighter.

- timeline(event_schema) — Extract events, order chronologically.

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

## Planning Rules

1. DETERMINISTIC FIRST, LLM LAST — but only when the deterministic filter
   has high recall. A free operation that destroys recall is worse than
   an LLM operation that gets the right answer.

2. MINIMIZE LLM CALLS — Use Tier 1 ops to shrink the document set before
   expensive Tier 3 ops touch it. Every dollar of LLM spend should touch
   the smallest possible set.

3. PLANS ARE LINEAR MOST OF THE TIME — 90% of plans are simple chains.
   Only use branching (id + input) when you need to search from multiple
   angles and merge.

4. LABEL BEFORE FILTER — When you need to classify and then keep matching
   docs, use label() followed by filter_by_label(). Don't try to combine
   them into one step.

5. CUSTOM SCHEMAS ARE POWERFUL — For compound questions, write a natural-
   language schema string rather than decomposing into multiple ops.
   Example: label(schema: "Does this thread contain a scheduling
   conflict where one parent changed plans without notice?", unit: "thread")

6. ESTIMATE COSTS — Tier 1 ops cost $0. Tier 3 ops cost roughly:
   - label (message, nano model): ~$0.001 per message
   - label (message, mini model): ~$0.003 per message
   - label (thread): ~$0.005 per thread (more tokens, fewer calls)
   - extract: ~$0.003 per message, ~$0.008 per thread

## Output Format

Produce a plan as an array of steps. Each step has:
- op: Operation name (must be from the list above)
- args_json: A JSON-encoded string of the arguments object (e.g. '{"terms": ["lawyer"], "mode": "any"}')
- id: (optional) String identifier, only needed if another step references this one
- input: (optional) Where this step gets its DocSet. Empty string or omit for previous step output. "corpus" for full corpus. A step id for that step's output. Comma-separated ids for union/intersect (e.g. "lex,sem").
- rationale: Why this step is needed
- estimated_cost: Estimated cost in USD (0 for free ops)`
}

// ── Structured Output Schema ─────────────────────────────────────────────────

const planStepSchema = {
  type: 'object',
  properties: {
    op: { type: 'string', description: 'Operation name from the available operations list' },
    args_json: { type: 'string', description: 'JSON-encoded string of arguments for the operation, e.g. \'{"terms": ["lawyer"], "mode": "any"}\'. Use "{}" if no arguments.' },
    id: { type: 'string', description: 'Step identifier. Use a short slug if another step needs to reference this one (e.g. "lex"), otherwise use empty string "".' },
    input: { type: 'string', description: 'Input reference. Empty string "" = previous step output (default). "corpus" = full corpus. A step id = that step\'s output. Comma-separated ids (e.g. "lex,sem") for union/intersect.' },
    rationale: { type: 'string', description: 'Why this step is needed' },
    estimated_cost: { type: 'number', description: 'Estimated cost in USD (0 for free ops)' }
  },
  required: ['op', 'args_json', 'id', 'input', 'rationale', 'estimated_cost'],
  additionalProperties: false
} as const

const planOutputSchema = {
  type: 'object',
  properties: {
    query_interpretation: {
      type: 'string',
      description: 'A one-sentence restatement of what the user is asking for'
    },
    steps: {
      type: 'array',
      items: planStepSchema
    },
    total_estimated_cost: { type: 'number', description: 'Total estimated cost in USD' },
    reasoning_summary: { type: 'string', description: 'Brief explanation of why you chose this plan over alternatives' }
  },
  required: ['query_interpretation', 'steps', 'total_estimated_cost', 'reasoning_summary'],
  additionalProperties: false
} as const

// ── Main Entry Point ─────────────────────────────────────────────────────────

export async function generatePlan(
  query: string,
  corpus: SiftDocument[],
  ctx?: Partial<Pick<ExecContext, 'openai'>>
): Promise<PlannerResult> {
  const openai: OpenAI = (ctx?.openai as OpenAI | undefined) ?? useOpenAI()

  const summary = buildCorpusSummary(corpus)
  const instructions = buildSystemPrompt(summary)

  const response = await openai.responses.create({
    model: 'gpt-5-mini',
    instructions,
    input: query,
    reasoning: { effort: 'high' },
    text: {
      format: {
        type: 'json_schema',
        name: 'execution_plan',
        strict: true,
        schema: planOutputSchema
      }
    },
    store: false
  })

  const raw = JSON.parse((response as any).output_text ?? '{}') as any
  const usage: any = (response as any).usage ?? {}

  const steps: PlanStep[] = Array.isArray(raw.steps)
    ? raw.steps.map((s: any) => {
        // Parse args from JSON string
        let args: Record<string, any> = {}
        try {
          args = typeof s.args_json === 'string' ? JSON.parse(s.args_json) : {}
        } catch {
          args = {}
        }

        const step: PlanStep = {
          op: String(s.op ?? ''),
          args,
          rationale: typeof s.rationale === 'string' ? s.rationale : undefined,
          estimated_cost: typeof s.estimated_cost === 'number' ? s.estimated_cost : 0
        }
        if (s.id) step.id = String(s.id)

        // Parse input — could be empty string (ignore), "corpus", a step id, or comma-separated ids
        if (typeof s.input === 'string' && s.input.trim()) {
          const trimmed = s.input.trim()
          if (trimmed.includes(',')) {
            step.input = trimmed.split(',').map((x: string) => x.trim()).filter(Boolean)
          } else {
            step.input = trimmed
          }
        }
        return step
      })
    : []

  return {
    query_interpretation: String(raw.query_interpretation ?? ''),
    steps,
    total_estimated_cost: Number(raw.total_estimated_cost ?? 0),
    reasoning_summary: String(raw.reasoning_summary ?? ''),
    usage: {
      input_tokens: Number(usage.input_tokens ?? 0),
      output_tokens: Number(usage.output_tokens ?? 0)
    }
  }
}
