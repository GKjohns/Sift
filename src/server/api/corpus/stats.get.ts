import { getCorpus } from '../../utils/corpus-store'

export default defineEventHandler(async () => {
  const corpus = await getCorpus()
  if (!corpus) {
    throw createError({ statusCode: 404, message: 'No corpus loaded' })
  }
  return corpus.stats
})
