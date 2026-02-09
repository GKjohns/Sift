export default defineEventHandler(async (event) => {
  await delay(120)

  const id = getRouterParam(event, 'id')
  const docs = generateDocuments()

  const doc = docs.find(d => d.id === id)
  if (!doc) {
    throw createError({ statusCode: 404, message: 'Message not found' })
  }

  return {
    thread_id: doc.metadata.thread_id || doc.id
  }
})