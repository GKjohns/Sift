export default defineEventHandler(async (event) => {
  await delay(150)

  const id = getRouterParam(event, 'id')
  const docs = generateDocuments()
  const labels = generateLabels(docs)
  const allMessages = buildMessageList(docs, labels)

  // Find the target message by doc ID
  const target = allMessages.find(m => m.id === id)
  if (!target) {
    throw createError({ statusCode: 404, message: `Message "${id}" not found` })
  }

  // Get thread context — messages in the same thread, sorted chronologically
  const threadMessages = allMessages
    .filter(m => m.thread_id && m.thread_id === target.thread_id)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  const targetIndex = threadMessages.findIndex(m => m.id === id)

  // Build context: messages before and after in the same thread
  const context_before = targetIndex > 0
    ? threadMessages.slice(Math.max(0, targetIndex - 3), targetIndex)
    : []

  const context_after = targetIndex < threadMessages.length - 1
    ? threadMessages.slice(targetIndex + 1, targetIndex + 4)
    : []

  return {
    ...target,
    context_before,
    context_after
  }
})
