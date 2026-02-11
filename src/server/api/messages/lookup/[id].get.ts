import { getCorpus } from '../../../utils/corpus-store'

export default defineEventHandler(async (event) => {
  const corpus = await getCorpus()
  if (!corpus) {
    throw createError({ statusCode: 404, message: 'No corpus loaded' })
  }

  const id = getRouterParam(event, 'id')
  const doc = corpus.documents.find(d => d.id === id)
  if (!doc) {
    throw createError({ statusCode: 404, message: 'Message not found' })
  }

  return {
    thread_id: doc.metadata.thread_id || doc.id,
  }
})
