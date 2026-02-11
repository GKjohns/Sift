import type OpenAI from 'openai'

import type { SiftDocument } from '~/types'
import { DocSet } from './docset'
import type { ExecContext, Labels, StepTrace, SynthesisCitation, SynthesisResult, ThreadLabelMeta } from './types'

import { useOpenAI } from '../utils/openai'

// ── Helpers ──────────────────────────────────────────────────────────────────

function coerceResponseOutputText(response: any): string {
  const direct = response?.output_text
  if (typeof direct === 'string') return direct

  // Fallback: attempt to reconstruct from the raw output array
  const out = response?.output
  if (Array.isArray(out)) {
    const parts: string[] = []
    for (const item of out) {
      const content = item?.content
      if (!Array.isArray(content)) continue
      for (const c of content) {
        if (typeof c?.text === 'string') parts.push(c.text)
      }
    }
    if (parts.length > 0) return parts.join('')
  }

  return ''
}

function stripMarkdownCodeFences(text: string): string {
  const trimmed = text.trim()
  if (!trimmed.startsWith('```')) return trimmed

  const lines = trimmed.split('\n')
  if (lines.length < 2) return trimmed

  // Remove opening fence (``` or ```json, etc.)
  if (lines[0]?.trim().startsWith('```')) lines.shift()

  // Remove closing fence if present
  if (lines.at(-1)?.trim() === '```') lines.pop()

  return lines.join('\n').trim()
}

function tryParseJsonObject(text: string): any | null {
  const cleaned = stripMarkdownCodeFences(text)
  if (!cleaned) return null

  try {
    return JSON.parse(cleaned)
  } catch {
    // try extracting the JSON object if the model wrapped it in extra text
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

function dedupeCitationsByDocId(citations: SynthesisCitation[]): SynthesisCitation[] {
  const seen = new Set<string>()
  const out: SynthesisCitation[] = []
  for (const c of citations) {
    if (!c.doc_id) continue
    if (seen.has(c.doc_id)) continue
    seen.add(c.doc_id)
    out.push(c)
  }
  return out
}

function hasThreadLabels(labels: ReadonlyMap<string, Labels>): boolean {
  for (const [, docLabels] of labels) {
    for (const key of Object.keys(docLabels)) {
      const entry = (docLabels as Record<string, any>)[key]
      if (entry?.thread_meta?.unit === 'thread') return true
    }
  }
  return false
}

function collectCitedMessageIds(labels: ReadonlyMap<string, Labels>): Set<string> {
  const cited = new Set<string>()
  for (const [, docLabels] of labels) {
    for (const key of Object.keys(docLabels)) {
      const entry = (docLabels as Record<string, any>)[key]
      const meta: ThreadLabelMeta | undefined = entry?.thread_meta
      if (meta?.cited_messages) {
        for (const id of meta.cited_messages) cited.add(id)
      }
    }
  }
  return cited
}

function groupDocsByThread(docs: readonly SiftDocument[]): Map<string, SiftDocument[]> {
  const groups = new Map<string, SiftDocument[]>()
  for (const doc of docs) {
    const threadId = doc.metadata.thread_id ?? `__no_thread__:${doc.id}`
    if (!groups.has(threadId)) groups.set(threadId, [])
    groups.get(threadId)!.push(doc)
  }
  // Sort messages within each thread chronologically
  for (const msgs of groups.values()) {
    msgs.sort((a, b) => {
      const ta = Date.parse(a.timestamp)
      const tb = Date.parse(b.timestamp)
      return (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0)
    })
  }
  return groups
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen - 3) + '...'
}

function formatTraceForPrompt(trace: StepTrace[]): string {
  if (trace.length === 0) return 'No execution trace available.'

  return trace.map((t, i) => {
    const status = t.status === 'error' ? ` [ERROR: ${t.error?.message ?? 'unknown'}]` : ''
    return `Step ${i + 1}: ${t.step.op}(${JSON.stringify(t.step.args)})${status}
  In: ${t.input_count} docs → Out: ${t.output_count} docs | Cost: $${t.cost_usd.toFixed(4)} | ${t.duration_ms}ms
  ${t.step.rationale ?? ''}`
  }).join('\n\n')
}

// ── Build LLM Input ──────────────────────────────────────────────────────────

function buildDocumentContext(
  docSet: DocSet,
  corpus: SiftDocument[],
  isThreadGrouped: boolean
): string {
  const labels = docSet.labels as ReadonlyMap<string, Labels>
  const citedIds = collectCitedMessageIds(labels)

  if (isThreadGrouped) {
    // Present documents grouped by thread
    const threadGroups = groupDocsByThread(docSet.docs)
    const blocks: string[] = []

    for (const [threadId, msgs] of threadGroups) {
      const displayId = threadId.startsWith('__no_thread__:') ? msgs[0]?.id ?? threadId : threadId

      let threadBlock = `THREAD: ${displayId} (${msgs.length} messages)\n────────────────────────────\n`

      // Collect thread-level labels (from the first message that has them)
      const threadLabels: string[] = []
      for (const msg of msgs) {
        const docLabels = labels.get(msg.id)
        if (!docLabels) continue
        for (const [key, entry] of Object.entries(docLabels)) {
          if (!entry) continue
          const meta = (entry as any).thread_meta as ThreadLabelMeta | undefined
          if (meta?.unit === 'thread') {
            threadLabels.push(`  ${key}: ${JSON.stringify(entry.value)} (confidence: ${entry.confidence.toFixed(2)})`)
          }
        }
        if (threadLabels.length > 0) break // Only need thread labels once
      }

      if (threadLabels.length > 0) {
        threadBlock += `Thread labels:\n${threadLabels.join('\n')}\n\n`
      }

      for (const msg of msgs) {
        const sender = msg.metadata.sender || 'Unknown'
        const ts = msg.timestamp
        const isCited = citedIds.has(msg.id)
        const citedMarker = isCited ? ' ★' : ''
        threadBlock += `[${msg.id}]${citedMarker} ${sender} — ${ts}\n${truncate(msg.text, 260)}\n\n`
      }

      threadBlock += '────────────────────────────'
      blocks.push(threadBlock)
    }

    return blocks.join('\n\n')
  }

  // Flat message list (message-level classification)
  return docSet.docs.map((doc) => {
    const sender = doc.metadata.sender || 'Unknown'
    const docLabels = labels.get(doc.id)
    let labelSummary = ''
    if (docLabels) {
      const parts: string[] = []
      for (const [key, entry] of Object.entries(docLabels)) {
        if (!entry) continue
        parts.push(`${key}=${JSON.stringify(entry.value)} (${entry.confidence.toFixed(2)})`)
      }
      if (parts.length > 0) labelSummary = `\n  Labels: ${parts.join(', ')}`
    }
    return `[${doc.id}] ${sender} — ${doc.timestamp}${labelSummary}\n${truncate(doc.text, 220)}`
  }).join('\n\n')
}

// ── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(isThreadGrouped: boolean): string {
  const base = `You are Sift's answer synthesizer. You receive the results of an execution plan that searched and classified a corpus of co-parenting messages. Your job is to produce a clear, accurate, citation-backed answer to the user's original query.

## Rules

1. ANSWER THE QUESTION — Be direct. Start with the answer, then provide supporting evidence.
2. CITE SPECIFIC MESSAGES — Use [doc-id] format to reference messages. Every factual claim must have at least one citation.
3. BE CONCISE — The user is a legal professional. Be precise and factual, not verbose.
4. ACKNOWLEDGE LIMITATIONS — If the results are incomplete (e.g., budget was exceeded, a step errored), say so.
5. USE THE LABELS — When documents have classification labels (tone, topic, custom), reference them to support your answer.
6. CONFIDENCE MATTERS — Only cite high-confidence results (confidence > 0.6) as definitive. Mention lower-confidence matches as "possible" or "uncertain".
7. FORMATTING — You may format the answer using Markdown (headings, bullet lists, emphasis). Do NOT use HTML.`

  const precisionNote = `

## Precision note (important)

If the user asks about *explicit mentions/keywords* (e.g., "messages that mention X"), do NOT include items that only "imply" the concept.
Only cite messages that actually contain the term(s) or match the regex/lexical criteria used by the plan.`

  if (isThreadGrouped) {
    return `${base}
${precisionNote}

## Thread-Level Results

The documents were classified at the thread level. Results are grouped by conversation thread.

When constructing citations, prefer the cited_messages (marked with ★) from
thread-level labels. These are the specific messages the classifier identified
as supporting its judgment. Cite those messages, not every message in the thread.

When presenting results, group your findings by thread. For each matching thread:
1. State the thread-level finding (e.g., "Thread 5 contains an expense
   disagreement over $350")
2. Cite the key messages that support this finding
3. Briefly describe the exchange

This is more natural for the reader — they want to understand what happened
in each conversation, not see a list of isolated messages.`
  }

  return `${base}
${precisionNote}

## Message-Level Results

The documents were classified at the individual message level. Present results as a list of relevant messages with their classifications and citations.`
}

// ── Structured Output Schema ─────────────────────────────────────────────────

const synthesisOutputSchema = {
  type: 'object',
  properties: {
    answer: {
      type: 'string',
      description: 'The answer to the user query in Markdown, with inline [doc-id] citations'
    },
    citations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          doc_id: { type: 'string', description: 'The document ID being cited' },
          preview: { type: 'string', description: 'A short excerpt (1-2 sentences) from the cited message' },
          thread_id: { type: 'string', description: 'The thread ID this message belongs to, if applicable. Use empty string if unknown.' }
        },
        required: ['doc_id', 'preview', 'thread_id'],
        additionalProperties: false
      },
      description: 'Array of citations referenced in the answer'
    }
  },
  required: ['answer', 'citations'],
  additionalProperties: false
} as const

// ── Main Entry Point ─────────────────────────────────────────────────────────

export async function synthesize(
  query: string,
  finalDocSet: DocSet,
  trace: StepTrace[],
  corpus: SiftDocument[],
  ctx?: Partial<Pick<ExecContext, 'openai'>>
): Promise<SynthesisResult> {
  const openai: OpenAI = (ctx?.openai as OpenAI | undefined) ?? useOpenAI()

  const isThreadGrouped = hasThreadLabels(finalDocSet.labels as ReadonlyMap<string, Labels>)

  // Keep the synthesizer fast: limit how many documents we send to the model.
  // (The full doc set is still returned to the caller; this only affects summarization.)
  const MAX_DOCS_FOR_SYNTHESIS = 60
  const docSetForSynthesis: DocSet = (() => {
    if (finalDocSet.docs.length <= MAX_DOCS_FOR_SYNTHESIS) return finalDocSet
    const keepDocs = [...finalDocSet.docs].slice(0, MAX_DOCS_FOR_SYNTHESIS)
    const keepIds = new Set(keepDocs.map(d => d.id))
    const nextLabels = new Map<string, Labels>()
    for (const [docId, labels] of finalDocSet.labels as ReadonlyMap<string, Labels>) {
      if (keepIds.has(docId)) nextLabels.set(docId, labels)
    }
    return new DocSet({ docs: keepDocs, labels: nextLabels, audit: [...finalDocSet.audit] })
  })()

  // Build the input for the synthesizer
  const documentContext = buildDocumentContext(docSetForSynthesis, corpus, isThreadGrouped)
  const traceContext = formatTraceForPrompt(trace)

  const input = `## User Query

${query}

## Execution Trace

${traceContext}

## Results (${finalDocSet.docs.length} documents)

${documentContext}`

  // Handle empty results gracefully
  if (finalDocSet.docs.length === 0) {
    return {
      answer: 'No documents matched your query after applying all filters. Try broadening your search criteria.',
      citations: [],
      thread_grouped: false
    }
  }

  const instructions = buildSystemPrompt(isThreadGrouped)

  const response = await openai.responses.create({
    model: 'gpt-5-nano',
    instructions,
    input,
    reasoning: { effort: 'low' },
    // Allow room for valid JSON + citations. Truncation causes JSON.parse failures,
    // which then leaks the raw JSON blob into the UI markdown renderer.
    max_output_tokens: 2200,
    text: {
      format: {
        type: 'json_schema',
        name: 'synthesis_result',
        strict: true,
        schema: synthesisOutputSchema
      }
    },
    store: false
  })

  const usage: any = (response as any).usage ?? {}

  const outputText = coerceResponseOutputText(response)
  const raw = tryParseJsonObject(outputText)
  if (!raw || typeof raw !== 'object') {
    // If the model output is truncated/invalid JSON, fall back to a plain-text answer.
    return {
      answer: String(outputText || 'Synthesis unavailable.'),
      citations: [],
      thread_grouped: isThreadGrouped,
      usage: {
        input_tokens: Number(usage.input_tokens ?? 0),
        output_tokens: Number(usage.output_tokens ?? 0)
      }
    }
  }

  // Build a lookup for message_number and thread_id enrichment
  const corpusMap = new Map<string, SiftDocument>()
  for (const doc of corpus) corpusMap.set(doc.id, doc)

  const citations: SynthesisCitation[] = Array.isArray(raw.citations)
    ? raw.citations.map((c: any) => {
        const docId = String(c.doc_id ?? '')
        const corpusDoc = corpusMap.get(docId)
        return {
          doc_id: docId,
          message_number: corpusDoc?.metadata.message_number,
          preview: String(c.preview ?? ''),
          thread_id: c.thread_id ? String(c.thread_id) : corpusDoc?.metadata.thread_id
        } satisfies SynthesisCitation
      })
    : []

  return {
    answer: String(raw.answer ?? 'Synthesis unavailable. The query returned results but the synthesizer could not produce a summary.'),
    citations: dedupeCitationsByDocId(citations).slice(0, 40),
    thread_grouped: isThreadGrouped,
    usage: {
      input_tokens: Number(usage.input_tokens ?? 0),
      output_tokens: Number(usage.output_tokens ?? 0)
    }
  }
}
