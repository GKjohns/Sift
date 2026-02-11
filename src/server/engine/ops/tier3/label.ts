import type OpenAI from 'openai'

import type { DocSet } from '../../docset'
import type { ExecContext, Labels, OpResult, ThreadLabelMeta } from '../../types'
import { estimateCost } from '../../types'
import { groupByThread } from '../../utils/thread-grouper'
import { parallelMap } from '../../utils/parallel'

import { useOpenAI } from '../../../utils/openai'

/** Max concurrent OpenAI calls for labeling */
const CONCURRENCY = 10

type Unit = 'message' | 'thread'

function getClient(ctx: ExecContext): OpenAI {
  return (ctx.openai as OpenAI | undefined) ?? useOpenAI()
}

function asUnit(raw: unknown): Unit {
  return (raw === 'thread' || raw === 'message') ? raw : 'message'
}

function clamp01(n: any): number {
  const x = Number(n)
  if (!Number.isFinite(x)) return 0
  return Math.max(0, Math.min(1, x))
}

// ── Unified JSON Schema ──────────────────────────────────────────────────────
//
// Every label call — tone, topic, or custom — uses the SAME output schema.
// The LLM always returns:
//   { label: string, confidence: number, rationale: string, cited_messages: string[] }
//
// Examples:
//   tone:   { label: "hostile",  confidence: 0.85, rationale: "...", cited_messages: ["doc-042"] }
//   topic:  { label: "scheduling", confidence: 0.9, rationale: "...", cited_messages: [] }
//   custom: { label: "yes",      confidence: 0.7,  rationale: "...", cited_messages: ["doc-007"] }
//           { label: "no",       confidence: 0.95, rationale: "...", cited_messages: [] }
//
// This makes filter_by_label trivial: `label == "hostile" AND confidence > 0.7`

const LABEL_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    label: {
      type: 'string',
      description: 'The classification result. For yes/no questions use "yes" or "no". For tone use "hostile", "neutral", or "cooperative". For topics use a short topic name. Keep it short and lowercase.'
    },
    confidence: {
      type: 'number',
      description: 'Confidence score from 0.0 to 1.0'
    },
    rationale: {
      type: 'string',
      description: 'One sentence explaining why this label was chosen'
    },
    cited_messages: {
      type: 'array',
      items: { type: 'string' },
      description: 'Message IDs (e.g. "doc-042") that support this classification. Only include the key evidence, not every message.'
    }
  },
  required: ['label', 'confidence', 'rationale', 'cited_messages'],
  additionalProperties: false
} as const

// ── Instructions ─────────────────────────────────────────────────────────────

function labelInstructions(schema: string, unit: Unit): string {
  const base = `You are a classifier for co-parenting communication.

Classification task: ${schema}

Return a JSON object with:
- "label": your classification (a short string — e.g. "hostile", "yes", "scheduling"). For yes/no questions, use "yes" or "no".
- "confidence": 0.0 to 1.0
- "rationale": one sentence explaining your reasoning
- "cited_messages": array of message IDs (e.g. ["doc-042"]) that are key evidence`

  if (unit === 'thread') {
    return `${base}

You will be given a full conversation thread (multiple messages between two co-parents).
Make ONE classification for the entire thread. Only cite the 1–3 most important messages.`
  }

  return `${base}

You will be given a single message. Classify that message. Use cited_messages with just that message's ID.`
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function labelDocs(docSet: DocSet, args: Record<string, any>, ctx: ExecContext): Promise<OpResult> {
  const schema = String(args?.schema ?? '').trim()
  const unit = asUnit(args?.unit)

  if (!schema) {
    return {
      docSet,
      meta: { duration_ms: 0, cost_usd: 0, result_count: docSet.docs.length, detail: { skipped: true, reason: 'missing_schema' } }
    }
  }

  if (docSet.docs.length === 0) {
    return {
      docSet,
      meta: { duration_ms: 0, cost_usd: 0, result_count: 0, detail: { skipped: true, reason: 'empty_docset', schema, unit } }
    }
  }

  const openai = getClient(ctx)
  const nextLabels = new Map<string, Labels>(docSet.labels as Map<string, Labels>)

  let totalInputTokens = 0
  let totalOutputTokens = 0
  let calls = 0

  // Use nano for well-known simple schemas, mini for custom/complex ones
  const isSimple = schema === 'tone' || schema === 'topic'
  const model = isSimple ? 'gpt-5-nano' : 'gpt-5-mini'
  const effort = isSimple ? 'low' : 'medium'

  // All labels are stored under one consistent key per schema invocation.
  // Short schemas ("tone", "topic") use themselves as the key.
  // Custom schemas get stored under "label" (since there's typically one per plan).
  const labelKey = isSimple ? schema : 'label'

  const instructions = labelInstructions(schema, unit)

  if (unit === 'thread') {
    const groups = groupByThread(docSet, ctx.corpus)

    await parallelMap(groups, async (g) => {
      calls += 1

      let parsed: any = {}
      try {
        const response = await openai.responses.create({
          model,
          instructions,
          input: g.rendered,
          reasoning: { effort },
          text: {
            format: {
              type: 'json_schema',
              name: 'classification',
              strict: true,
              schema: LABEL_OUTPUT_SCHEMA
            }
          },
          store: false
        })

        const usage: any = (response as any).usage ?? {}
        const inputTokens = Number(usage.input_tokens ?? usage.prompt_tokens ?? 0)
        const outputTokens = Number(usage.output_tokens ?? usage.completion_tokens ?? 0)

        // Some SDK responses omit usage — fall back to a conservative estimate.
        totalInputTokens += (inputTokens > 0 ? inputTokens : g.token_estimate)
        totalOutputTokens += (outputTokens > 0 ? outputTokens : 180)

        parsed = JSON.parse((response as any).output_text ?? '{}')
      } catch {
        return
      }

      const labelValue = String(parsed.label ?? '').trim().toLowerCase()
      const confidence = clamp01(parsed.confidence)
      const rationale = typeof parsed.rationale === 'string' ? parsed.rationale : ''
      const cited_messages = Array.isArray(parsed.cited_messages)
        ? parsed.cited_messages.map((x: any) => String(x))
        : []

      const thread_meta: ThreadLabelMeta = {
        unit: 'thread',
        thread_id: g.thread_id,
        cited_messages
      }

      for (const docId of g.docset_message_ids) {
        const existing = nextLabels.get(docId) ?? {}
        nextLabels.set(docId, {
          ...existing,
          [labelKey]: { value: labelValue, confidence, rationale, thread_meta }
        } as Labels)
      }
    }, CONCURRENCY)

    return {
      docSet: docSet.withLabels(nextLabels),
      meta: {
        duration_ms: 0,
        cost_usd: estimateCost(model, totalInputTokens, totalOutputTokens),
        result_count: docSet.docs.length,
        detail: {
          schema,
          unit,
          model,
          label_key: labelKey,
          calls,
          concurrency: CONCURRENCY,
          thread_count: groups.length,
          token_estimate_total: groups.reduce((sum, g) => sum + g.token_estimate, 0),
          usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens }
        }
      }
    }
  }

  // unit === 'message' — parallel LLM calls
  await parallelMap(docSet.docs as unknown as any[], async (doc: any) => {
    calls += 1
    const input = `Message [${doc.id}] ${doc.metadata.sender} — ${doc.timestamp}\n${doc.text}`.trim()
    const inputEstimate = Math.ceil(input.length / 4)

    let parsed: any = {}
    try {
      const response = await openai.responses.create({
        model,
        instructions,
        input,
        reasoning: { effort },
        text: {
          format: {
            type: 'json_schema',
            name: 'classification',
            strict: true,
            schema: LABEL_OUTPUT_SCHEMA
          }
        },
        store: false
      })

      const usage: any = (response as any).usage ?? {}
      const inputTokens = Number(usage.input_tokens ?? usage.prompt_tokens ?? 0)
      const outputTokens = Number(usage.output_tokens ?? usage.completion_tokens ?? 0)

      totalInputTokens += (inputTokens > 0 ? inputTokens : inputEstimate)
      totalOutputTokens += (outputTokens > 0 ? outputTokens : 140)

      parsed = JSON.parse((response as any).output_text ?? '{}')
    } catch {
      return
    }

    const labelValue = String(parsed.label ?? '').trim().toLowerCase()
    const confidence = clamp01(parsed.confidence)
    const rationale = typeof parsed.rationale === 'string' ? parsed.rationale : ''

    const existing = nextLabels.get(doc.id) ?? {}
    nextLabels.set(doc.id, {
      ...existing,
      [labelKey]: { value: labelValue, confidence, rationale }
    } as Labels)
  }, CONCURRENCY)

  return {
    docSet: docSet.withLabels(nextLabels),
    meta: {
      duration_ms: 0,
      cost_usd: estimateCost(model, totalInputTokens, totalOutputTokens),
      result_count: docSet.docs.length,
      detail: {
        schema,
        unit,
        model,
        label_key: labelKey,
        calls,
        concurrency: CONCURRENCY,
        usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens }
      }
    }
  }
}
