/**
 * Test script for OFW PDF parser.
 * Run with: npx tsx scripts/test-parser.ts [path-to-pdf]
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

// We can't use ~/types alias from outside nuxt, so we import the parser
// functions directly using relative paths
const PDF_PATH = process.argv[2]
  || '/Users/kylejohnson/Desktop/OFW_Messages_Report_2026-02-10_21-22-46/OFW_Messages_Report_2026-02-10_21-22-46.pdf'

// ── Inline the parser logic for standalone testing ──
// (In production, use the server util directly)

async function extractTextFromPDF(pdfPath: string): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')

  const data = new Uint8Array(readFileSync(pdfPath))
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise

  const pageTexts: string[] = []

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const textContent = await page.getTextContent()

    let lastY: number | null = null
    let lineText = ''

    for (const item of textContent.items) {
      if (!('str' in item)) continue
      const y = Math.round((item as any).transform[5])

      if (lastY !== null && Math.abs(y - lastY) > 5) {
        pageTexts.push(lineText)
        lineText = ''
      }

      lineText += item.str
      lastY = y
    }
    if (lineText) pageTexts.push(lineText)
    pageTexts.push('__PAGE_BREAK__')
  }

  return pageTexts.join('\n')
}

// Regex patterns
const SENT_RE = /^Sent:\s*(\d{2}\/\d{2}\/\d{4})\s+at\s+(\d{1,2}:\d{2}\s+[AP]M)\s*$/
const FROM_RE = /^From:\s+(.+)$/
const TO_WITH_FV_RE = /^To:\s+(.+?)\(First Viewed:\s*(\d{2}\/\d{2}\/\d{4})\s+at\s+(\d{1,2}:\d{2}\s+[AP]M)\)\s*$/
const TO_RE = /^To:\s+(.+)$/
const SUBJECT_RE = /^Subject:\s+(.*)$/
const PAGE_HEADER_RE = /^\| Message Report Page \d+ of \d+$/
const MESSAGE_MARKER_RE = /^Message (\d+) of (\d+)$/
const ATTACHMENT_RE = /See Attachments:/

function parseOFWDate(dateStr: string, timeStr: string): string {
  const [month, day, year] = dateStr.split('/')
  const timeParts = timeStr.trim().split(' ')
  const meridian = timeParts[1]!
  const [hoursStr, minutesStr] = timeParts[0]!.split(':')
  let hours = parseInt(hoursStr!, 10)
  const minutes = parseInt(minutesStr!, 10)
  if (meridian === 'PM' && hours !== 12) hours += 12
  if (meridian === 'AM' && hours === 12) hours = 0
  return `${year}-${month}-${day}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
}

function cleanText(rawText: string): string {
  const lines = rawText.split('\n')
  const cleaned: string[] = []
  let lastContentLine: string | null = null
  let skipDuplicateCount = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (/^__PAGE_BREAK__$/.test(trimmed)) { skipDuplicateCount = 2; continue }
    if (PAGE_HEADER_RE.test(trimmed)) { continue }
    if (skipDuplicateCount > 0 && trimmed) {
      if (lastContentLine && trimmed === lastContentLine) { skipDuplicateCount--; continue }
      skipDuplicateCount = 0
    }
    cleaned.push(line)
    if (trimmed) lastContentLine = trimmed
  }
  return cleaned.join('\n')
}

interface ParsedHeader {
  sent: string; from: string; to: string; firstViewed: string | null
  subject: string; bodyLines: string[]; attachments: string[]; lineIndex: number
}

function parseAttachmentLine(line: string): string[] {
  const cleaned = line.replace(/See Attachments:\s*/g, '').replace(/\s*See Attachments:?/g, '').trim()
  if (!cleaned) return []
  return cleaned.split(',')
    .map(part => part.trim().replace(/\s*\(\d+\.?\d*\s*[KMGT]?B\)\s*$/i, '').trim())
    .filter(name => name.length > 0 && /\.\w{2,4}$/.test(name))
}

function extractAllHeaders(lines: string[]): ParsedHeader[] {
  const entries: ParsedHeader[] = []
  let i = 0

  while (i < lines.length) {
    const trimmed = lines[i]!.trim()
    const sentMatch = trimmed.match(SENT_RE)
    if (!sentMatch) { i++; continue }

    const sentDate = parseOFWDate(sentMatch[1]!, sentMatch[2]!)
    const headerStart = i

    let j = i + 1
    while (j < lines.length && !lines[j]!.trim()) j++
    const fromMatch = lines[j]?.trim().match(FROM_RE)
    if (!fromMatch) { i++; continue }
    const from = fromMatch[1]!.trim()

    j++
    while (j < lines.length && !lines[j]!.trim()) j++
    const toLine = lines[j]?.trim() || ''
    let to: string, firstViewed: string | null = null
    const toFvMatch = toLine.match(TO_WITH_FV_RE)
    if (toFvMatch) {
      to = toFvMatch[1]!.trim()
      firstViewed = parseOFWDate(toFvMatch[2]!, toFvMatch[3]!)
    } else {
      const toMatch = toLine.match(TO_RE)
      if (!toMatch) { i++; continue }
      to = toMatch[1]!.trim()
    }

    j++
    while (j < lines.length && !lines[j]!.trim()) j++
    let subject = ''
    const subjLine = lines[j]?.trim() || ''
    const subjMatch = subjLine.match(SUBJECT_RE)
    if (subjMatch) { subject = subjMatch[1]?.trim() || ''; j++ }
    else if (/^Re:\s+/i.test(subjLine)) { subject = subjLine; j++ }

    const bodyLines: string[] = []
    const attachments: string[] = []
    while (j < lines.length) {
      const bodyTrimmed = lines[j]!.trim()
      if (SENT_RE.test(bodyTrimmed)) break
      if (MESSAGE_MARKER_RE.test(bodyTrimmed)) { j++; break }
      if (ATTACHMENT_RE.test(bodyTrimmed)) { attachments.push(...parseAttachmentLine(bodyTrimmed)); j++; continue }
      if (/^__PAGE_BREAK__$/.test(bodyTrimmed)) { j++; continue }
      if (bodyLines.length === 0 && !bodyTrimmed) { j++; continue }
      // Skip duplicate Subject line at start of body (page-break artifact)
      if (bodyLines.length === 0 && subject) {
        const sc = bodyTrimmed.replace(/^Subject:\s+/, '')
        if (sc === subject || bodyTrimmed === subject) { j++; continue }
      }
      bodyLines.push(lines[j]!)
      j++
    }
    while (bodyLines.length > 0 && !bodyLines[bodyLines.length - 1]!.trim()) bodyLines.pop()

    entries.push({ sent: sentDate, from, to, firstViewed, subject, bodyLines, attachments, lineIndex: headerStart })
    i = j
  }
  return entries
}

interface UniqueMessage {
  sent: string; from: string; to: string; firstViewed: string | null
  subject: string; body: string; attachments: string[]; messageNumber: number | null
}

function deduplicateMessages(entries: ParsedHeader[]): UniqueMessage[] {
  const uniqueMap = new Map<string, UniqueMessage>()
  for (const entry of entries) {
    const body = entry.bodyLines.join('\n').trim()
    const key = `${entry.from}|${entry.sent}`
    const existing = uniqueMap.get(key)
    const msg: UniqueMessage = {
      sent: entry.sent, from: entry.from, to: entry.to,
      firstViewed: entry.firstViewed,
      subject: entry.subject || existing?.subject || '',
      body,
      attachments: entry.attachments.length > 0 ? entry.attachments : (existing?.attachments || []),
      messageNumber: null,
    }
    if (!existing || body.length > existing.body.length) {
      if (!msg.subject && existing?.subject) msg.subject = existing.subject
      if (msg.attachments.length === 0 && existing?.attachments?.length) msg.attachments = existing.attachments
      uniqueMap.set(key, msg)
    } else {
      if (entry.attachments.length > 0 && existing.attachments.length === 0) existing.attachments = entry.attachments
      if (!existing.subject && entry.subject) existing.subject = entry.subject
    }
  }
  return Array.from(uniqueMap.values())
}

function assignMessageNumbers(lines: string[], markerPositions: { line: number; num: number; total: number }[], messages: UniqueMessage[]): number {
  const lookup = new Map<string, UniqueMessage>()
  for (const msg of messages) lookup.set(`${msg.from}|${msg.sent}`, msg)

  let totalMessages = 0

  for (let idx = 0; idx < markerPositions.length; idx++) {
    const marker = markerPositions[idx]!
    totalMessages = Math.max(totalMessages, marker.total)
    const regionStart = idx > 0 ? markerPositions[idx - 1]!.line + 1 : 0
    const regionEnd = marker.line

    let newestTimestamp = '', newestFrom = '', newestSent = ''
    for (let k = regionStart; k < regionEnd; k++) {
      const sentMatch = lines[k]!.trim().match(SENT_RE)
      if (!sentMatch) continue
      const sent = parseOFWDate(sentMatch[1]!, sentMatch[2]!)
      let fromName = ''
      for (let m = k + 1; m < regionEnd && m < k + 5; m++) {
        const fromMatch = lines[m]!.trim().match(FROM_RE)
        if (fromMatch) { fromName = fromMatch[1]!.trim(); break }
      }
      if (sent > newestTimestamp) { newestTimestamp = sent; newestFrom = fromName; newestSent = sent }
    }

    if (newestFrom && newestSent) {
      const key = `${newestFrom}|${newestSent}`
      const msg = lookup.get(key)
      if (msg && msg.messageNumber === null) msg.messageNumber = marker.num
    }
  }
  return totalMessages
}

// ── Main test ──

async function main() {
  console.log(`\n📄 Parsing OFW PDF: ${PDF_PATH}\n`)
  console.log('Step 1: Extracting text from PDF...')

  const rawText = await extractTextFromPDF(PDF_PATH)
  console.log(`  Text length: ${rawText.length} chars, ${rawText.split('\n').length} lines`)

  console.log('\nStep 2: Cleaning text...')
  const cleaned = cleanText(rawText)
  const lines = cleaned.split('\n')
  console.log(`  Cleaned: ${cleaned.length} chars, ${lines.length} lines`)

  console.log('\nStep 3: Extracting all message headers...')
  const allEntries = extractAllHeaders(lines)
  console.log(`  Found ${allEntries.length} message headers (including thread context duplicates)`)

  console.log('\nStep 4: Deduplicating...')
  const messages = deduplicateMessages(allEntries)
  messages.sort((a, b) => a.sent.localeCompare(b.sent))
  console.log(`  ${messages.length} unique messages after deduplication`)

  console.log('\nStep 5: Finding marker positions & assigning message numbers...')
  const markerPositions: { line: number; num: number; total: number }[] = []
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]!.trim().match(MESSAGE_MARKER_RE)
    if (match) markerPositions.push({ line: i, num: parseInt(match[1]!, 10), total: parseInt(match[2]!, 10) })
  }
  const totalReportMessages = assignMessageNumbers(lines, markerPositions, messages)
  const numbered = messages.filter(m => m.messageNumber !== null).length
  console.log(`  Report total: ${totalReportMessages} messages`)
  console.log(`  Successfully numbered: ${numbered} messages`)
  console.log(`  Unnumbered: ${messages.length - numbered} messages`)

  // ── Summary stats ──
  const senders = [...new Set(messages.map(m => m.from))]
  const timestamps = messages.map(m => m.sent).sort()
  console.log('\n═══ PARSE RESULTS ═══')
  console.log(`Total unique messages: ${messages.length}`)
  console.log(`Expected (from report): ${totalReportMessages}`)
  console.log(`Match: ${messages.length === totalReportMessages ? '✅ YES' : '❌ NO (difference: ' + (messages.length - totalReportMessages) + ')'}`)
  console.log(`Senders: ${senders.join(', ')}`)
  console.log(`Date range: ${timestamps[0]} → ${timestamps[timestamps.length - 1]}`)

  // Messages per sender
  for (const sender of senders) {
    const count = messages.filter(m => m.from === sender).length
    console.log(`  ${sender}: ${count} messages`)
  }

  // Attachment summary
  const withAttachments = messages.filter(m => m.attachments.length > 0)
  console.log(`\nMessages with attachments: ${withAttachments.length}`)
  for (const m of withAttachments) {
    console.log(`  Message ${m.messageNumber ?? '?'} (${m.from}, ${m.sent}): ${m.attachments.join(', ')}`)
  }

  // Thread analysis — structural (union-find on adjacency + reverse-chrono)
  console.log('\nStep 6: Building structural thread groups (adjacency union-find)...')

  // Union-Find
  const parent = new Map<string, string>()
  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x)
    while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)! }
    return x
  }
  function union(a: string, b: string) { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb) }

  // Register all messages
  for (const msg of messages) find(`${msg.from}|${msg.sent}`)

  // Walk all Sent: headers and union adjacent reverse-chrono pairs
  const allHeaders: { key: string; sent: string }[] = []
  for (let k = 0; k < lines.length; k++) {
    const sentMatch = lines[k]!.trim().match(SENT_RE)
    if (!sentMatch) continue
    const sent = parseOFWDate(sentMatch[1]!, sentMatch[2]!)
    let fromName = ''
    for (let m = k + 1; m < lines.length && m < k + 5; m++) {
      const fromMatch = lines[m]!.trim().match(FROM_RE)
      if (fromMatch) { fromName = fromMatch[1]!.trim(); break }
    }
    if (fromName) allHeaders.push({ key: `${fromName}|${sent}`, sent })
  }

  let unions = 0, breaks = 0
  for (let i = 1; i < allHeaders.length; i++) {
    if (allHeaders[i]!.sent <= allHeaders[i - 1]!.sent) {
      union(allHeaders[i - 1]!.key, allHeaders[i]!.key)
      unions++
    } else {
      breaks++
    }
  }
  console.log(`  Adjacent pairs: ${allHeaders.length - 1} | Unions: ${unions} | Breaks: ${breaks}`)

  // Build groups
  const threadGroups = new Map<string, string[]>()
  for (const msg of messages) {
    const key = `${msg.from}|${msg.sent}`
    const root = find(key)
    if (!threadGroups.has(root)) threadGroups.set(root, [])
    threadGroups.get(root)!.push(key)
  }

  // Assign thread IDs
  const slugify = (s: string) => s.replace(/^(Re:\s*)+/i, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled'
  const msgLookup = new Map<string, UniqueMessage>()
  for (const msg of messages) msgLookup.set(`${msg.from}|${msg.sent}`, msg)

  const slugUsage = new Map<string, number>()
  const groupInfos: { members: string[]; slug: string; oldest: string }[] = []
  for (const [, memberKeys] of threadGroups) {
    let oldestSent = '\uffff', rootSubject = ''
    for (const key of memberKeys) {
      const msg = msgLookup.get(key)
      if (msg && msg.sent < oldestSent) { oldestSent = msg.sent; rootSubject = msg.subject }
    }
    const slug = slugify(rootSubject)
    groupInfos.push({ members: memberKeys, slug, oldest: oldestSent })
    slugUsage.set(slug, (slugUsage.get(slug) || 0) + 1)
  }
  groupInfos.sort((a, b) => a.oldest.localeCompare(b.oldest))

  const msgToThread = new Map<string, string>()
  const slugCounter = new Map<string, number>()
  for (const group of groupInfos) {
    const count = slugCounter.get(group.slug) || 0
    slugCounter.set(group.slug, count + 1)
    const needsDisambig = (slugUsage.get(group.slug) || 0) > 1
    const threadId = needsDisambig && count > 0 ? `${group.slug}-${count + 1}` : group.slug
    for (const key of group.members) msgToThread.set(key, threadId)
  }

  // Summarize threads
  const threadSizes = new Map<string, number>()
  for (const tid of msgToThread.values()) threadSizes.set(tid, (threadSizes.get(tid) || 0) + 1)
  console.log(`  Thread groups: ${threadSizes.size}`)
  const disambiguated = [...slugUsage.entries()].filter(([, c]) => c > 1)
  if (disambiguated.length > 0) {
    console.log(`  Disambiguated slugs: ${disambiguated.map(([s, c]) => `${s} (${c} threads)`).join(', ')}`)
  } else {
    console.log(`  No disambiguation needed`)
  }

  console.log(`\nThreads (top 10 by size):`)
  for (const [tid, count] of [...threadSizes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  "${tid}": ${count} messages`)
  }

  // Show first 5 messages
  console.log('\n═══ FIRST 5 MESSAGES ═══')
  for (const msg of messages.slice(0, 5)) {
    console.log(`\n--- Message #${msg.messageNumber ?? '?'} ---`)
    console.log(`  From: ${msg.from}`)
    console.log(`  To: ${msg.to}`)
    console.log(`  Sent: ${msg.sent}`)
    console.log(`  Subject: ${msg.subject}`)
    console.log(`  Body (${msg.body.length} chars): ${msg.body.substring(0, 150)}${msg.body.length > 150 ? '...' : ''}`)
    if (msg.attachments.length > 0) console.log(`  Attachments: ${msg.attachments.join(', ')}`)
  }

  // Show last 3 messages
  console.log('\n═══ LAST 3 MESSAGES ═══')
  for (const msg of messages.slice(-3)) {
    console.log(`\n--- Message #${msg.messageNumber ?? '?'} ---`)
    console.log(`  From: ${msg.from}`)
    console.log(`  To: ${msg.to}`)
    console.log(`  Sent: ${msg.sent}`)
    console.log(`  Subject: ${msg.subject}`)
    console.log(`  Body (${msg.body.length} chars): ${msg.body.substring(0, 150)}${msg.body.length > 150 ? '...' : ''}`)
  }

  // Check for empty bodies
  const emptyBodies = messages.filter(m => !m.body.trim())
  if (emptyBodies.length > 0) {
    console.log(`\n⚠️  Messages with empty bodies: ${emptyBodies.length}`)
    for (const m of emptyBodies.slice(0, 5)) {
      console.log(`  Message #${m.messageNumber}: ${m.from} @ ${m.sent} — Subject: ${m.subject}`)
    }
  }

  // Check for missing subjects
  const noSubject = messages.filter(m => !m.subject)
  if (noSubject.length > 0) {
    console.log(`\n⚠️  Messages with no subject: ${noSubject.length}`)
    for (const m of noSubject.slice(0, 5)) {
      console.log(`  Message #${m.messageNumber}: ${m.from} @ ${m.sent} — Body preview: ${m.body.substring(0, 80)}`)
    }
  }

  // Save full output as JSON for inspection
  const outputPath = resolve(process.cwd(), 'scripts/parsed-messages.json')
  writeFileSync(outputPath, JSON.stringify(messages, null, 2))
  console.log(`\nFull parsed messages saved to: ${outputPath}`)
}

main().catch(console.error)
