export default defineEventHandler(async (event) => {
  const body = await readBody<{
    format: 'html' | 'csv' | 'json'
    scope: string
    includeLabels: boolean
    includeToneAnalysis: boolean
    includeAuditTrail: boolean
  }>(event)

  await delay(800)

  const docs = generateDocuments()
  const labels = generateLabels(docs)
  const messages = buildMessageList(docs, labels)

  if (body.format === 'csv') {
    const headers = ['Message #', 'Date', 'Sender', 'Recipient', 'Word Count', 'Text']
    if (body.includeLabels || body.includeToneAnalysis) {
      headers.push('Tone', 'Confidence')
    }
    const rows = messages.map(m => [
      m.message_number,
      m.timestamp,
      m.sender,
      m.recipient,
      m.word_count,
      `"${m.text.replace(/"/g, '""')}"`,
      ...(body.includeLabels || body.includeToneAnalysis ? [m.tone, m.confidence?.toFixed(2)] : [])
    ].join(','))

    const csv = [headers.join(','), ...rows].join('\n')
    return { content: csv, filename: 'sift-export.csv', mime: 'text/csv' }
  }

  if (body.format === 'json') {
    const data = {
      exported_at: new Date().toISOString(),
      corpus: 'OFW Message Export',
      total_messages: messages.length,
      messages: messages.map(m => ({
        id: m.id,
        message_number: m.message_number,
        sender: m.sender,
        recipient: m.recipient,
        timestamp: m.timestamp,
        text: m.text,
        word_count: m.word_count,
        ...(body.includeLabels || body.includeToneAnalysis ? { tone: m.tone, confidence: m.confidence } : {})
      })),
      ...(body.includeAuditTrail ? {
        audit_trail: {
          operations: [
            { op: 'ingest', args: { source: 'ofw_pdf', format: 'pdf' }, timestamp: new Date().toISOString() },
            { op: 'label', args: { schema: 'tone' }, timestamp: new Date().toISOString() }
          ]
        }
      } : {})
    }
    return { content: JSON.stringify(data, null, 2), filename: 'sift-export.json', mime: 'application/json' }
  }

  // HTML format
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Sift Export — OFW Messages</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; background: #fafaf8; color: #1c1917; }
    .header { border-bottom: 2px solid #4a9e6e; padding-bottom: 1rem; margin-bottom: 2rem; }
    .message { padding: 1rem; margin-bottom: 0.5rem; border-radius: 8px; border: 1px solid #e7e5e4; }
    .message.sarah { background: #f5f5f4; }
    .message.david { background: #fafaf9; }
    .sender { font-weight: 600; font-size: 0.875rem; }
    .meta { font-size: 0.75rem; color: #78716c; margin-top: 0.25rem; }
    .body { margin-top: 0.5rem; line-height: 1.6; }
    .tone { display: inline-block; padding: 0.125rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 500; }
    .tone.hostile { background: #fecaca; color: #991b1b; }
    .tone.neutral { background: #e5e7eb; color: #374151; }
    .tone.cooperative { background: #bbf7d0; color: #166534; }
    .date-divider { text-align: center; color: #78716c; font-size: 0.75rem; margin: 1.5rem 0; position: relative; }
    .date-divider::before, .date-divider::after { content: ''; position: absolute; top: 50%; width: 35%; height: 1px; background: #d6d3d1; }
    .date-divider::before { left: 0; }
    .date-divider::after { right: 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>OFW Message Export</h1>
    <p>${messages.length} messages · ${new Date(messages[0]!.timestamp).toLocaleDateString()} – ${new Date(messages[messages.length - 1]!.timestamp).toLocaleDateString()}</p>
  </div>
  ${messages.map(m => `
  <div class="message ${m.sender.includes('Sarah') ? 'sarah' : 'david'}">
    <div class="sender">${m.sender} → ${m.recipient} <span class="meta">#${m.message_number}</span></div>
    <div class="meta">${new Date(m.timestamp).toLocaleString()}${m.tone ? ` · <span class="tone ${m.tone}">${m.tone} (${Math.round((m.confidence || 0) * 100)}%)</span>` : ''}</div>
    <div class="body">${m.text}</div>
  </div>`).join('\n')}
</body>
</html>`

  return { content: html, filename: 'sift-export.html', mime: 'text/html' }
})
