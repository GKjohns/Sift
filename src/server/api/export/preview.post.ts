import type { ExportPreview } from '~/types'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    format: 'html' | 'csv' | 'json'
    scope: string
    includeLabels: boolean
    includeToneAnalysis: boolean
    includeAuditTrail: boolean
  }>(event)

  await delay(500)

  const docs = generateDocuments()
  const labels = generateLabels(docs)
  const messages = buildMessageList(docs, labels)

  let preview_content = ''
  let row_count = messages.length
  let estimated_size = ''

  if (body.format === 'csv') {
    const headers = ['Message #', 'Date', 'Sender', 'Recipient', 'Text']
    if (body.includeLabels || body.includeToneAnalysis) {
      headers.push('Tone', 'Confidence')
    }
    const rows = messages.slice(0, 5).map(m => [
      m.message_number,
      new Date(m.timestamp).toLocaleDateString(),
      m.sender,
      m.recipient,
      `"${m.text.substring(0, 60)}..."`,
      ...(body.includeLabels || body.includeToneAnalysis ? [m.tone, m.confidence?.toFixed(2)] : [])
    ].join(','))

    preview_content = [headers.join(','), ...rows, `... and ${messages.length - 5} more rows`].join('\n')
    estimated_size = '47 KB'
  } else if (body.format === 'json') {
    const sample = messages.slice(0, 2).map(m => ({
      id: m.id,
      sender: m.sender,
      timestamp: m.timestamp,
      text: m.text.substring(0, 80) + '...',
      ...(body.includeLabels ? { tone: m.tone, confidence: m.confidence } : {})
    }))
    preview_content = JSON.stringify({ messages: sample, total: messages.length, _truncated: true }, null, 2)
    estimated_size = '128 KB'
  } else {
    // HTML preview
    const sample = messages.slice(0, 3)
    preview_content = sample.map(m =>
      `<div class="message">\n  <div class="sender">${m.sender}</div>\n  <div class="date">${new Date(m.timestamp).toLocaleString()}</div>\n  <div class="body">${m.text.substring(0, 100)}...</div>\n</div>`
    ).join('\n\n')
    preview_content += `\n\n<!-- ... ${messages.length - 3} more messages -->`
    estimated_size = '89 KB'
  }

  const result: ExportPreview = {
    format: body.format,
    row_count,
    preview_content,
    estimated_size
  }

  return result
})
