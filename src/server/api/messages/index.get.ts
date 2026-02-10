export default defineEventHandler(async (event) => {
  await delay(300)

  const query = getQuery(event)
  const search = (query.search as string || '').toLowerCase()
  const tone = query.tone as string || 'all'
  const sender = query.sender as string || 'all'
  const sort = query.sort as string || 'newest'

  const docs = generateDocuments()
  const labels = generateLabels(docs)
  let messages = buildMessageList(docs, labels)

  // Apply search filter
  if (search) {
    messages = messages.filter(m =>
      m.text.toLowerCase().includes(search)
      || m.sender.toLowerCase().includes(search)
      || (m.subject?.toLowerCase().includes(search) ?? false)
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
  } else {
    messages.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  }

  const senders = [...new Set(docs.map(d => d.metadata.sender))]

  return {
    messages,
    total: messages.length,
    senders
  }
})
