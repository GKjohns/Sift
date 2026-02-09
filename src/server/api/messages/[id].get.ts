export default defineEventHandler(async (event) => {
  await delay(250)

  const threadId = getRouterParam(event, 'id')
  const docs = generateDocuments()
  const labels = generateLabels(docs)
  const allMessages = buildMessageList(docs, labels)

  // Filter messages belonging to this thread
  const threadMessages = allMessages.filter(m => m.thread_id === threadId)

  if (threadMessages.length === 0) {
    throw createError({ statusCode: 404, message: 'Thread not found' })
  }

  // Sort chronologically
  threadMessages.sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  const senders = [...new Set(threadMessages.map(m => m.sender))]
  const subject = threadMessages[0]!.subject?.replace(/^Re:\s*/i, '') || 'Untitled Thread'

  return {
    thread_id: threadId,
    subject,
    messages: threadMessages,
    senders
  }
})
