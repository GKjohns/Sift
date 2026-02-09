// Dev endpoint: Extract timeline events from a set of messages using OpenAI
// Uses OpenAI Responses API with structured output

interface ExtractedEvent {
  title: string
  description: string
  date: string
  tone: 'hostile' | 'neutral' | 'cooperative'
  topic: string
  significance: 'high' | 'medium' | 'low'
  source_message_numbers: number[]
}

interface ExtractionResult {
  events: ExtractedEvent[]
  summary: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ thread_id?: string; topic_filter?: string; max_events?: number }>(event)

  const openai = useOpenAI()

  // Get messages from fake data, optionally filtered by thread
  const docs = generateDocuments()
  let targetDocs = docs

  if (body.thread_id) {
    targetDocs = docs.filter(d => d.metadata.thread_id === body.thread_id)
    if (targetDocs.length === 0) {
      throw createError({ statusCode: 404, message: `No messages found for thread ${body.thread_id}` })
    }
  }

  // Format messages for the LLM
  const messagesText = targetDocs.map(doc =>
    `[Msg #${doc.metadata.message_number}] ${doc.timestamp} | ${doc.metadata.sender} → ${doc.metadata.recipient} | Subject: ${doc.metadata.subject || 'N/A'}\n${doc.text}`
  ).join('\n\n---\n\n')

  const maxEvents = body.max_events || 10

  const instructions = `You are an event extractor for co-parenting communication. Your job is to read a set of messages and extract discrete, significant events — things that happened, decisions made, agreements reached, conflicts that occurred.

Each event should:
- Have a clear, descriptive title (e.g., "Jake's arm fracture — ER visit", "Spring break compromise reached")
- Include a one-paragraph description of what happened
- Reference the specific message numbers that document it
- Be classified by tone and topic
- Be rated by significance:
  - **high**: Legal implications, medical events, custody violations, major agreements
  - **medium**: Scheduling changes, expense decisions, school meetings
  - **low**: Routine confirmations, minor logistics

${body.topic_filter ? `Focus on events related to: ${body.topic_filter}` : 'Extract all significant events.'}

Extract up to ${maxEvents} events, prioritizing by significance. Order chronologically.`

  const response = await openai.responses.create({
    model: 'gpt-5-mini',
    instructions,
    input: messagesText,
    reasoning: {
      effort: 'medium',
      summary: 'concise'
    },
    text: {
      format: {
        type: 'json_schema',
        name: 'timeline_extraction',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            events: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'Short descriptive title' },
                  description: { type: 'string', description: 'One-paragraph description of the event' },
                  date: { type: 'string', description: 'ISO date string (YYYY-MM-DD)' },
                  tone: { type: 'string', enum: ['hostile', 'neutral', 'cooperative'] },
                  topic: { type: 'string', description: 'Topic category: Scheduling, Medical, School, Activities, Expenses, Custody Exchange, or other' },
                  significance: { type: 'string', enum: ['high', 'medium', 'low'] },
                  source_message_numbers: {
                    type: 'array',
                    items: { type: 'number' },
                    description: 'Message numbers that document this event'
                  }
                },
                required: ['title', 'description', 'date', 'tone', 'topic', 'significance', 'source_message_numbers'],
                additionalProperties: false
              }
            },
            summary: {
              type: 'string',
              description: 'A brief 2-3 sentence summary of the overall narrative across these events'
            }
          },
          required: ['events', 'summary'],
          additionalProperties: false
        }
      }
    },
    store: false
  })

  const extraction: ExtractionResult = JSON.parse(response.output_text)

  return {
    extraction,
    messages_analyzed: targetDocs.length,
    usage: response.usage,
    model: response.model
  }
})
