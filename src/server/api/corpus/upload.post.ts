import { parseOFWPdf } from '../../utils/ofw-parser'
import {
  setCorpus,
  buildMessageListFromDocs,
  buildThreadSummariesFromDocs,
  buildCorpusStatsFromDocs,
} from '../../utils/corpus-store'

export default defineEventHandler(async (event) => {
  // Read multipart form data
  const formData = await readMultipartFormData(event)
  if (!formData || formData.length === 0) {
    throw createError({ statusCode: 400, message: 'No file uploaded' })
  }

  const file = formData.find(f => f.name === 'file')
  if (!file || !file.data) {
    throw createError({ statusCode: 400, message: 'No file found in upload' })
  }

  const filename = file.filename || 'upload.pdf'

  // Validate it's a PDF
  if (!filename.toLowerCase().endsWith('.pdf')) {
    throw createError({ statusCode: 400, message: 'Only PDF files are supported' })
  }

  try {
    // Parse the PDF
    const pdfData = new Uint8Array(file.data)
    const { documents, parseResult } = await parseOFWPdf(pdfData)

    // Build all derived data
    const messages = buildMessageListFromDocs(documents)
    const threads = buildThreadSummariesFromDocs(documents)
    const stats = buildCorpusStatsFromDocs(documents)

    // Store in memory
    await setCorpus({
      documents,
      labels: {},
      messages,
      threads,
      stats,
      filename,
    })

    return {
      success: true,
      message: `Parsed ${documents.length} messages from ${parseResult.senders.join(' & ')}`,
      stats,
      parseInfo: {
        totalMessages: documents.length,
        reportEntries: parseResult.totalReportMessages,
        rawHeaders: parseResult.totalRawHeaders,
        senders: parseResult.senders,
        dateRange: parseResult.dateRange,
        threads: threads.length,
      },
    }
  }
  catch (err: any) {
    console.error('PDF parse error:', err)
    throw createError({
      statusCode: 500,
      message: `Failed to parse PDF: ${err.message || 'Unknown error'}`,
    })
  }
})
