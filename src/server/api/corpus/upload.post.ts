export default defineEventHandler(async () => {
  // Simulate parsing + indexing delay
  await delay(1500)

  const docs = generateDocuments()
  const labels = generateLabels(docs)
  const stats = buildCorpusStats(docs, labels)

  return {
    success: true,
    message: `Parsed ${docs.length} messages from OFW export`,
    stats
  }
})
