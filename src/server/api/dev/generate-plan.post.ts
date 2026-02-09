// Dev endpoint: Generate an execution plan from a natural language query
// Uses OpenAI Responses API with structured output

interface PlanStep {
  op: string
  tier: 1 | 2 | 3
  args_json: string
  rationale: string
  estimated_result_count: number | null
  estimated_cost: number
}

interface ExecutionPlan {
  query_interpretation: string
  steps: PlanStep[]
  total_estimated_cost: number
  reasoning_summary: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ query: string }>(event)

  if (!body.query?.trim()) {
    throw createError({ statusCode: 400, message: 'Query is required' })
  }

  const openai = useOpenAI()

  // Build corpus context from fake data so the model knows what it's working with
  const docs = generateDocuments()
  const labels = generateLabels(docs)
  const stats = buildCorpusStats(docs, labels)

  const corpusContext = `Corpus summary:
- ${stats.total_documents} documents (OFW co-parenting messages)
- Senders: ${stats.senders.map(s => `${s.name} (${s.count} messages)`).join(', ')}
- Date range: ${stats.date_range.start} to ${stats.date_range.end}
- Tone analysis available: ${stats.has_tone_analysis ? 'yes' : 'no'}
- Topics covered: scheduling, school, medical, activities, expenses, custody exchanges`

  const instructions = `You are Sift's query planner. Your job is to decompose a natural language query about a document corpus into a sequence of operations.

Available operations (use ONLY these):

TIER 1 — Free (SQL/string matching):
- filter_metadata(where) — Filter by sender, date range, thread_id, word_count, etc.
- search_lex(terms, mode) — Keyword search. Modes: "any", "all", "phrase". Returns matching docs.
- search_regex(pattern) — Regex over document text. For dollar amounts, dates, structured patterns.
- top_k(by, k) — Take top K docs by timestamp or relevance. Caps set size before expensive ops.
- sample(n, strategy) — Random, stratified, or recent sample. Strategies: "random", "stratified", "recent".
- get_context(doc_id, window) — Retrieve surrounding documents for conversational context.
- count(by) — Count by sender, day, week, label, entity.
- trend(metric, interval) — Metric over time. e.g. hostile messages per week.

TIER 2 — Cheap (embeddings, ~$0.001-0.01):
- search_semantic(query, k) — Embedding similarity search. Returns approximate top-K.
- cluster(method) — Group documents by theme. Methods: "topic", "sender_behavior".

TIER 3 — Expensive (LLM per document, ~$0.01-0.10):
- label(schema, budget) — Classify documents. Schemas: "tone", "topic", "commitment", "violation".
- extract(schema) — Pull structured fields: commitments, dates, claims, violations. Returns spans.
- filter_by_label(condition) — Filter on LLM-generated labels. e.g. tone == "hostile" AND confidence > 0.7
- timeline(event_schema) — Extract events, order chronologically, attach citations.

CORE PRINCIPLE: Deterministic first, LLM last. Always use cheap Tier 1/2 operations to narrow the document set BEFORE using expensive Tier 3 operations. Every dollar of LLM spend should touch the smallest possible set of documents.

CRITICAL — RECALL VS. PRECISION TRADEOFF:
Lexical search (search_lex) is fast and free but ONLY finds exact keyword matches. Think hard about what it will MISS:
- A message like "You forgot to pick him up today! WTF!!!" is about scheduling/pickup but won't match "schedule" or "pickup" (it says "pick him up", not "pickup").
- Angry messages about a topic may use entirely different vocabulary than calm messages about the same topic.
- People refer to concepts indirectly, with pronouns, slang, abbreviations, or emotional language that doesn't contain the "obvious" keywords.

When the user's query is about a CONCEPT (not a specific word), you must account for this gap. Strategies:
1. Use search_lex with a broad term list as an initial cheap pass, but acknowledge it's a recall-limited filter.
2. Supplement with search_semantic to catch messages that are conceptually related but use different vocabulary.
3. If high recall matters for the query, consider using search_semantic as the PRIMARY filter instead of search_lex, even though it costs more — missing relevant documents is worse than spending an extra cent.
4. For queries about tone + topic combinations (e.g. "contentious scheduling"), consider that you may need BOTH a topic filter AND a tone classifier — the topic filter alone won't capture emotional intensity.

Think about what a frustrated, angry, or panicked parent would ACTUALLY write vs. what a calm person describing the same situation would write. They use very different words.

${corpusContext}

Given the user's query, produce an execution plan as a sequence of steps. Each step should use one operation. Think carefully about:
1. What information does the user need?
2. How can we narrow the document set cheaply first?
3. What will a lexical search MISS? Is that acceptable, or do we need semantic search to fill the gaps?
4. Which operations are actually needed (don't add unnecessary steps)?
5. What's the estimated cost?

For each step's args_json field, provide the arguments as a JSON-encoded string (e.g. '{"terms": ["lawyer"], "mode": "any"}').`

  const response = await openai.responses.create({
    model: 'gpt-5.2',
    instructions,
    input: body.query,
    reasoning: {
      effort: 'high',
      summary: 'concise'
    },
    text: {
      format: {
        type: 'json_schema',
        name: 'execution_plan',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            query_interpretation: {
              type: 'string',
              description: 'A one-sentence restatement of what the user is asking for'
            },
            steps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  op: { type: 'string', description: 'Operation name from the available operations list' },
                  tier: { type: 'number', description: 'Cost tier: 1, 2, or 3' },
                  args_json: {
                    type: 'string',
                    description: 'JSON-encoded string of arguments for the operation'
                  },
                  rationale: { type: 'string', description: 'Why this step is needed' },
                  estimated_result_count: {
                    type: ['number', 'null'],
                    description: 'Estimated number of documents this step will return'
                  },
                  estimated_cost: { type: 'number', description: 'Estimated cost in USD (0 for free ops)' }
                },
                required: ['op', 'tier', 'args_json', 'rationale', 'estimated_result_count', 'estimated_cost'],
                additionalProperties: false
              }
            },
            total_estimated_cost: { type: 'number', description: 'Total estimated cost in USD' },
            reasoning_summary: { type: 'string', description: 'Brief explanation of why you chose this plan over alternatives' }
          },
          required: ['query_interpretation', 'steps', 'total_estimated_cost', 'reasoning_summary'],
          additionalProperties: false
        }
      }
    },
    store: false
  })

  const raw: ExecutionPlan = JSON.parse(response.output_text)

  // Parse args_json back into objects for the client
  const plan = {
    ...raw,
    steps: raw.steps.map(step => ({
      ...step,
      args: JSON.parse(step.args_json) as Record<string, unknown>,
      args_json: undefined
    }))
  }

  return {
    plan,
    usage: response.usage,
    model: response.model
  }
})
