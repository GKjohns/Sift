import { getCorpus } from '../../utils/corpus-store'

export default defineEventHandler(async (event) => {
  const corpus = await getCorpus()
  if (!corpus) {
    return { messages: [], total: 0, senders: [], threads: [], }
  }

  const query = getQuery(event)
  const search = (query.search as string || '').toLowerCase()
  const tone = query.tone as string || 'all'
  const sender = query.sender as string || 'all'
  const sort = query.sort as string || 'newest'

  let messages = [...corpus.messages]

  // Apply search filter
  if (search) {
    messages = messages.filter(m =>
      m.text.toLowerCase().includes(search)
      || m.sender.toLowerCase().includes(search)
      || (m.subject?.toLowerCase().includes(search) ?? false),
    )
  }

  // Apply tone filter
  if (tone !== 'all') {
    messages = messages.filter(m => m.tone === tone)
  }

  // Apply sender filter
  if (sender !== 'all') {
    messages = messages.filter(m => m.sender === sender)
  }

  // Sort
  if (sort === 'oldest') {
    messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  }
  else {
    messages.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  }

  const senders = [...new Set(corpus.documents.map(d => d.metadata.sender))]

  return {
    messages,
    total: messages.length,
    senders,
    // Also return threads for the thread view
    threads: corpus.threads,
  }
})
