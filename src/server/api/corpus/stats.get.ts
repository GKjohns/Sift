export default defineEventHandler(async () => {
  await delay(300)

  const docs = generateDocuments()
  const labels = generateLabels(docs)
  return buildCorpusStats(docs, labels)
})
