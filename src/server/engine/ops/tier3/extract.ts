import type OpenAI from 'openai'

import type { DocSet } from '../../docset'
import type { ExecContext, Labels, OpResult, Span } from '../../types'
import { estimateCost } from '../../types'
import { groupByThread } from '../../utils/thread-grouper'
import { parallelMap } from '../../utils/parallel'

import { useOpenAI } from '../../../utils/openai'

/** Max concurrent OpenAI calls for extraction */
const CONCURRENCY = 10

type Unit = 'message' | 'thread'

interface ExtractionItem {
  message_id: string
  field: string
  value: string
  span: { start: number; end: number }
  confidence: number
  context: string
}

function getClient(ctx: ExecContext): OpenAI {
  return (ctx.openai as OpenAI | undefined) ?? useOpenAI()
}

function schemaKey(raw: unknown): string {
  return String(raw ?? '').trim()
}

function asUnit(raw: unknown): Unit {
  return (raw === 'thread' || raw === 'message') ? raw : 'message'
}

function clamp01(n: any): number {
  const x = Number(n)
  if (!Number.isFinite(x)) return 0
  return Math.max(0, Math.min(1, x))
}

function mergeLabel(nextLabels: Map<string, Labels>, docId: string, key: string, value: any): void {
  const existing = nextLabels.get(docId) ?? {}
  nextLabels.set(docId, { ...existing, [key]: value } as Labels)
}

function extractSchema() {
  return {
    type: 'object',
    properties: {
      extractions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            message_id: { type: 'string' },
            field: { type: 'string' },
            value: { type: 'string' },
            span: {
              type: 'object',
              properties: {
                start: { type: 'number' },
                end: { type: 'number' }
              },
              required: ['start', 'end'],
              additionalProperties: false
            },
            confidence: { type: 'number' },
            context: { type: 'string' }
          },
          required: ['message_id', 'field', 'value', 'span', 'confidence', 'context'],
          additionalProperties: false
        }
      }
    },
    required: ['extractions'],
    additionalProperties: false
  } as const
}

function extractInstructions(schema: string, unit: Unit): string {
  const base = `You are an information extraction system for co-parenting communication.

Return ONLY valid JSON that matches the provided JSON schema.

Extraction schema: ${schema}

For each extracted item:
- Choose a short field name (e.g. "commitment", "violation", "financial_amount", "date", "location").
- Provide value as a concise normalized string.
- Provide span.start and span.end as character offsets within the message TEXT ONLY (not including any header lines).`

  if (unit === 'thread') {
    return `${base}

You will be given a conversation thread with multiple messages.
- You may extract items that require cross-message context.
- Always attach each extracted item to the specific message_id that contains the extracted text span.`
  }

  return `${base}

You will be given a single message. Extract items from that message.`
}

function spansFromExtractions(items: ExtractionItem[]): Span[] {
  return items
    .map((x) => {
      const start = Number(x.span?.start)
      const end = Number(x.span?.end)
      if (!Number.isFinite(start) || !Number.isFinite(end)) return null
      if (start < 0 || end < start) return null
      return { start, end } satisfies Span
    })
    .filter(Boolean) as Span[]
}

export async function extractDocs(docSet: DocSet, args: Record<string, any>, ctx: ExecContext): Promise<OpResult> {
  const schema = schemaKey(args?.schema)
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

  const model = 'gpt-5-mini'

  const labelKey = `extract:${schema}`

  if (unit === 'thread') {
    const groups = groupByThread(docSet, ctx.corpus)
    const instructions = extractInstructions(schema, unit)
    const outSchema = extractSchema()

    await parallelMap(groups, async (g) => {
      calls += 1

      let parsed: any = {}
      try {
        const response = await openai.responses.create({
          model,
          instructions,
          input: g.rendered,
          reasoning: { effort: 'medium' },
          text: {
            format: {
              type: 'json_schema',
              name: 'thread_extract',
              strict: true,
              schema: outSchema
            }
          },
          store: false
        })

        const usage: any = (response as any).usage ?? {}
        const inputTokens = Number(usage.input_tokens ?? usage.prompt_tokens ?? 0)
        const outputTokens = Number(usage.output_tokens ?? usage.completion_tokens ?? 0)

        totalInputTokens += (inputTokens > 0 ? inputTokens : g.token_estimate)
        totalOutputTokens += (outputTokens > 0 ? outputTokens : 240)

        parsed = JSON.parse((response as any).output_text ?? '{}')
      } catch {
        return
      }

      const itemsRaw = Array.isArray(parsed.extractions) ? parsed.extractions : []
      const items: ExtractionItem[] = itemsRaw.map((x: any) => ({
        message_id: String(x?.message_id ?? ''),
        field: String(x?.field ?? ''),
        value: String(x?.value ?? ''),
        span: { start: Number(x?.span?.start ?? 0), end: Number(x?.span?.end ?? 0) },
        confidence: clamp01(x?.confidence),
        context: String(x?.context ?? '')
      })).filter((x: ExtractionItem) => Boolean(x.message_id))

      const byMsg = new Map<string, ExtractionItem[]>()
      for (const it of items) {
        if (!byMsg.has(it.message_id)) byMsg.set(it.message_id, [])
        byMsg.get(it.message_id)!.push(it)
      }

      for (const docId of g.docset_message_ids) {
        const mine = byMsg.get(docId) ?? []
        if (mine.length === 0) continue

        const confidence = mine.reduce((sum, x) => sum + clamp01(x.confidence), 0) / mine.length
        mergeLabel(nextLabels, docId, labelKey, {
          value: mine,
          confidence,
          spans: spansFromExtractions(mine)
        })
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
          calls,
          concurrency: CONCURRENCY,
          thread_count: groups.length,
          token_estimate_total: groups.reduce((sum, g) => sum + g.token_estimate, 0),
          usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens },
          label_key: labelKey
        }
      }
    }
  }

  // unit === 'message' — parallel LLM calls
  const instructions = extractInstructions(schema, unit)
  const outSchema = extractSchema()

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
        reasoning: { effort: 'medium' },
        text: {
          format: {
            type: 'json_schema',
            name: 'message_extract',
            strict: true,
            schema: outSchema
          }
        },
        store: false
      })

      const usage: any = (response as any).usage ?? {}
      const inputTokens = Number(usage.input_tokens ?? usage.prompt_tokens ?? 0)
      const outputTokens = Number(usage.output_tokens ?? usage.completion_tokens ?? 0)

      totalInputTokens += (inputTokens > 0 ? inputTokens : inputEstimate)
      totalOutputTokens += (outputTokens > 0 ? outputTokens : 240)

      parsed = JSON.parse((response as any).output_text ?? '{}')
    } catch {
      return
    }

    const itemsRaw = Array.isArray(parsed.extractions) ? parsed.extractions : []
    const items: ExtractionItem[] = itemsRaw.map((x: any) => ({
      message_id: doc.id,
      field: String(x?.field ?? ''),
      value: String(x?.value ?? ''),
      span: { start: Number(x?.span?.start ?? 0), end: Number(x?.span?.end ?? 0) },
      confidence: clamp01(x?.confidence),
      context: String(x?.context ?? '')
    }))

    if (items.length > 0) {
      const confidence = items.reduce((sum, x) => sum + clamp01(x.confidence), 0) / items.length
      mergeLabel(nextLabels, doc.id, labelKey, { value: items, confidence, spans: spansFromExtractions(items) })
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
        calls,
        usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens },
        label_key: labelKey
      }
    }
  }
}

