import { getCorpus } from '../../../utils/corpus-store'

export default defineEventHandler(async (event) => {
  const corpus = await getCorpus()
  if (!corpus) {
    throw createError({ statusCode: 404, message: 'No corpus loaded' })
  }

  const threadId = getRouterParam(event, 'threadId')
  if (!threadId) {
    throw createError({ statusCode: 400, message: 'Missing threadId' })
  }

  // Messages in this thread, sorted chronologically
  const threadMessages = corpus.messages
    .filter(m => (m.thread_id || m.id) === threadId)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  if (threadMessages.length === 0) {
    throw createError({ statusCode: 404, message: `Thread "${threadId}" not found` })
  }

  const first = threadMessages[0]!
  const senders = [...new Set(threadMessages.map(m => m.sender))]

  return {
    thread_id: threadId,
    subject: first.subject?.replace(/^Re:\s*/i, '') || 'Untitled Thread',
    messages: threadMessages,
    senders,
  }
})

