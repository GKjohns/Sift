import type { TimelineResponse } from '~/types'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ tone?: string; topic?: string }>(event)

  await delay(1800)

  let events = generateTimelineEvents()

  // Apply filters
  if (body.tone && body.tone !== 'all') {
    events = events.filter(e => e.tone === body.tone)
  }

  if (body.topic && body.topic !== 'all') {
    events = events.filter(e => e.topic === body.topic)
  }

  const dates = events.map(e => e.date).sort()
  const topics = [...new Set(events.map(e => e.topic))]

  const response: TimelineResponse = {
    events,
    title: 'OFW Communication Timeline',
    date_range: {
      start: dates[0] || '',
      end: dates[dates.length - 1] || ''
    },
    total_source_docs: events.reduce((sum, e) => sum + e.source_doc_ids.length, 0),
    topics
  }

  return response
})
