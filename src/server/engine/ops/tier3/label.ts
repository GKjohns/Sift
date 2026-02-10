import type OpenAI from 'openai'

import type { ToneLabel } from '~/types'
import type { DocSet } from '../../docset'
import type { ExecContext, Labels, OpResult, ThreadLabelMeta } from '../../types'
import { estimateCost } from '../../types'
import { groupByThread } from '../../utils/thread-grouper'

import { useOpenAI } from '../../../utils/openai'

type Unit = 'message' | 'thread'

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

function toneSchema(unit: Unit) {
  return {
    type: 'object',
    properties: {
      overall_tone: { type: 'string', enum: ['hostile', 'neutral', 'cooperative'] },
      confidence: { type: 'number' },
      rationale: { type: 'string' },
      cited_messages: { type: 'array', items: { type: 'string' } },
      key_phrases: { type: 'array', items: { type: 'string' } }
    },
    required: unit === 'thread'
      ? ['overall_tone', 'confidence', 'rationale', 'cited_messages']
      : ['overall_tone', 'confidence', 'rationale'],
    additionalProperties: false
  } as const
}

function topicSchema(unit: Unit) {
  return {
    type: 'object',
    properties: {
      primary_topic: { type: 'string' },
      secondary_topics: { type: 'array', items: { type: 'string' } },
      confidence: { type: 'number' },
      rationale: { type: 'string' },
      cited_messages: { type: 'array', items: { type: 'string' } }
    },
    required: unit === 'thread'
      ? ['primary_topic', 'confidence', 'rationale', 'cited_messages']
      : ['primary_topic', 'confidence', 'rationale'],
    additionalProperties: false
  } as const
}

function customSchema(unit: Unit) {
  return {
    type: 'object',
    properties: {
      matches: { type: 'boolean' },
      confidence: { type: 'number' },
      rationale: { type: 'string' },
      cited_messages: { type: 'array', items: { type: 'string' } },
      details: { type: 'object', additionalProperties: true }
    },
    required: unit === 'thread'
      ? ['matches', 'confidence', 'rationale', 'cited_messages', 'details']
      : ['matches', 'confidence', 'rationale', 'details'],
    additionalProperties: false
  } as const
}

function labelInstructions(schema: string, unit: Unit): string {
  const base = `You are a classifier for co-parenting communication.

Return ONLY valid JSON that matches the provided JSON schema.

Classification target schema: ${schema}`

  if (unit === 'thread') {
    return `${base}

You will be given a full conversation thread (multiple messages).

- Make ONE classification for the entire thread.
- Provide a short rationale that references the conversation.
- Return cited_messages: an array of the specific message IDs (e.g. "doc-042") that best support your judgment. Do NOT cite every message—only the key evidence.`
  }

  return `${base}

You will be given a single message (one document). Provide your classification for that message.`
}

export async function labelDocs(docSet: DocSet, args: Record<string, any>, ctx: ExecContext): Promise<OpResult> {
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

  const isTone = schema === 'tone'
  const isTopic = schema === 'topic'

  const model = isTone || isTopic ? 'gpt-5-nano' : 'gpt-5-mini'
  const effort = isTone || isTopic ? 'low' : 'medium'

  if (unit === 'thread') {
    const groups = groupByThread(docSet, ctx.corpus)

    for (const g of groups) {
      calls += 1

      const response = await openai.responses.create({
        model,
        instructions: labelInstructions(schema, unit),
        input: g.rendered,
        reasoning: { effort },
        text: {
          format: {
            type: 'json_schema',
            name: 'thread_label',
            strict: true,
            schema: isTone ? toneSchema(unit) : isTopic ? topicSchema(unit) : customSchema(unit)
          }
        },
        store: false
      })

      const usage: any = (response as any).usage ?? {}
      totalInputTokens += Number(usage.input_tokens ?? 0)
      totalOutputTokens += Number(usage.output_tokens ?? 0)

      const parsed = JSON.parse((response as any).output_text ?? '{}') as any
      const cited_messages = Array.isArray(parsed.cited_messages) ? parsed.cited_messages.map((x: any) => String(x)) : []

      const thread_meta: ThreadLabelMeta = {
        unit: 'thread',
        thread_id: g.thread_id,
        cited_messages
      }

      if (isTone) {
        const tone = String(parsed.overall_tone ?? 'neutral') as ToneLabel
        const confidence = clamp01(parsed.confidence)
        const rationale = typeof parsed.rationale === 'string' ? parsed.rationale : undefined
        const key_phrases = Array.isArray(parsed.key_phrases) ? parsed.key_phrases.map((x: any) => String(x)) : undefined

        for (const docId of g.docset_message_ids) {
          mergeLabel(nextLabels, docId, 'tone', { value: tone, confidence, rationale, key_phrases, thread_meta })
        }
      } else if (isTopic) {
        const primary_topic = String(parsed.primary_topic ?? '').trim() || 'unknown'
        const confidence = clamp01(parsed.confidence)
        const rationale = typeof parsed.rationale === 'string' ? parsed.rationale : undefined
        const secondary_topics = Array.isArray(parsed.secondary_topics) ? parsed.secondary_topics.map((x: any) => String(x)) : undefined

        for (const docId of g.docset_message_ids) {
          mergeLabel(nextLabels, docId, 'topic', { value: primary_topic, confidence, rationale, secondary_topics, thread_meta })
        }
      } else {
        const confidence = clamp01(parsed.confidence)
        const matches = Boolean(parsed.matches)
        const rationale = typeof parsed.rationale === 'string' ? parsed.rationale : undefined
        const details = (parsed.details && typeof parsed.details === 'object') ? parsed.details : {}

        for (const docId of g.docset_message_ids) {
          mergeLabel(nextLabels, docId, schema, { value: { matches, details }, confidence, rationale, thread_meta })
        }
      }
    }

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
          thread_count: groups.length,
          token_estimate_total: groups.reduce((sum, g) => sum + g.token_estimate, 0),
          usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens }
        }
      }
    }
  }

  // unit === 'message' (simple implementation: one call per message)
  for (const doc of docSet.docs) {
    calls += 1
    const input = `Message [${doc.id}] ${doc.metadata.sender} — ${doc.timestamp}\n${doc.text}`.trim()

    const response = await openai.responses.create({
      model,
      instructions: labelInstructions(schema, unit),
      input,
      reasoning: { effort },
      text: {
        format: {
          type: 'json_schema',
          name: 'message_label',
          strict: true,
          schema: isTone ? toneSchema(unit) : isTopic ? topicSchema(unit) : customSchema(unit)
        }
      },
      store: false
    })

    const usage: any = (response as any).usage ?? {}
    totalInputTokens += Number(usage.input_tokens ?? 0)
    totalOutputTokens += Number(usage.output_tokens ?? 0)

    const parsed = JSON.parse((response as any).output_text ?? '{}') as any

    if (isTone) {
      const tone = String(parsed.overall_tone ?? 'neutral') as ToneLabel
      const confidence = clamp01(parsed.confidence)
      const rationale = typeof parsed.rationale === 'string' ? parsed.rationale : undefined
      const key_phrases = Array.isArray(parsed.key_phrases) ? parsed.key_phrases.map((x: any) => String(x)) : undefined
      mergeLabel(nextLabels, doc.id, 'tone', { value: tone, confidence, rationale, key_phrases })
    } else if (isTopic) {
      const primary_topic = String(parsed.primary_topic ?? '').trim() || 'unknown'
      const confidence = clamp01(parsed.confidence)
      const rationale = typeof parsed.rationale === 'string' ? parsed.rationale : undefined
      const secondary_topics = Array.isArray(parsed.secondary_topics) ? parsed.secondary_topics.map((x: any) => String(x)) : undefined
      mergeLabel(nextLabels, doc.id, 'topic', { value: primary_topic, confidence, rationale, secondary_topics })
    } else {
      const confidence = clamp01(parsed.confidence)
      const matches = Boolean(parsed.matches)
      const rationale = typeof parsed.rationale === 'string' ? parsed.rationale : undefined
      const details = (parsed.details && typeof parsed.details === 'object') ? parsed.details : {}
      mergeLabel(nextLabels, doc.id, schema, { value: { matches, details }, confidence, rationale })
    }
  }

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
        usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens }
      }
    }
  }
}

