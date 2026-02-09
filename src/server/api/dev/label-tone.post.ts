// Dev endpoint: Classify a message's tone using OpenAI
// Uses structured output for reliable JSON

interface ToneResult {
  tone: 'hostile' | 'neutral' | 'cooperative'
  confidence: number
  rationale: string
  key_phrases: string[]
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ message_text: string; sender?: string; context?: string }>(event)

  if (!body.message_text?.trim()) {
    throw createError({ statusCode: 400, message: 'message_text is required' })
  }

  const openai = useOpenAI()

  const instructions = `You are a tone classifier for co-parenting communication messages. Your job is to classify each message as one of three tones:

- **hostile**: Aggressive, accusatory, threatening, passive-aggressive, or deliberately uncooperative language. Examples: threats to involve lawyers, accusations of irresponsibility, refusal to compromise, sarcasm, score-keeping.
- **neutral**: Informational, matter-of-fact, neither warm nor cold. Logistics without emotional charge. Examples: "The appointment is at 3pm", scheduling confirmations, factual updates.
- **cooperative**: Warm, appreciative, flexible, solution-oriented. Examples: thanking the other parent, offering compromises, expressing gratitude, acknowledging the other's perspective.

Important nuances:
- A message can have hostile CONTENT but cooperative FRAMING (e.g., "I understand you're frustrated, but this keeps happening"). Classify based on overall tone.
- Firm ≠ hostile. Setting boundaries clearly without aggression is neutral.
- Context matters: if a message escalates a previously calm discussion, weight that in your assessment.

Rate your confidence from 0.0 to 1.0:
- 0.9+ = very clear tone (e.g., explicit threat, effusive thanks)
- 0.7-0.9 = moderate confidence (tone is present but mixed signals)
- 0.5-0.7 = uncertain (could go either way)

Identify the key phrases that most strongly signal the tone.`

  const input = body.context
    ? `Context: ${body.context}\n\nMessage from ${body.sender || 'Unknown'}:\n"${body.message_text}"`
    : `Message from ${body.sender || 'Unknown'}:\n"${body.message_text}"`

  const response = await openai.responses.create({
    model: 'gpt-5-nano',
    instructions,
    input,
    reasoning: {
      effort: 'low'
    },
    text: {
      format: {
        type: 'json_schema',
        name: 'tone_classification',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            tone: {
              type: 'string',
              description: 'The classified tone',
              enum: ['hostile', 'neutral', 'cooperative']
            },
            confidence: {
              type: 'number',
              description: 'Confidence score from 0.0 to 1.0'
            },
            rationale: {
              type: 'string',
              description: 'Brief explanation of why this tone was chosen'
            },
            key_phrases: {
              type: 'array',
              items: { type: 'string' },
              description: 'Key phrases from the message that signal this tone'
            }
          },
          required: ['tone', 'confidence', 'rationale', 'key_phrases'],
          additionalProperties: false
        }
      }
    },
    store: false
  })

  const result: ToneResult = JSON.parse(response.output_text)

  return {
    result,
    usage: response.usage,
    model: response.model
  }
})
