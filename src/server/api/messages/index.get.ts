export default defineEventHandler(async (event) => {
  await delay(300)

  const query = getQuery(event)
  const search = (query.search as string || '').toLowerCase()
  const tone = query.tone as string || 'all'

  const docs = generateDocuments()
  const labels = generateLabels(docs)
  let threads = buildThreadSummaries(docs, labels)

  // Apply search filter (matches thread subject or message text within threads)
  if (search) {
    const allMessages = buildMessageList(docs, labels)
    threads = threads.filter((t) => {
      // Match on subject
      if (t.subject.toLowerCase().includes(search)) return true
      // Match on any message text in the thread
      return allMessages.some(
        m => m.thread_id === t.thread_id && m.text.toLowerCase().includes(search)
      )
    })
  }

  // Apply tone filter (threads that contain at least one message with the tone)
  if (tone !== 'all') {
    threads = threads.filter((t) => {
      const key = tone as keyof typeof t.tone_summary
      return t.tone_summary[key] > 0
    })
  }

  return {
    threads,
    total: threads.length
  }
})
