/**
 * OFW (Our Family Wizard) Message Report PDF Parser
 *
 * Deterministic, regex-based parser for OFW "Message Report" PDFs.
 * Extracts individual messages from the thread-view PDF format where
 * each "Message X of Y" entry contains the newest reply at the top
 * and full thread history below.
 *
 * Strategy:
 *  1. Extract raw text from PDF via pdfjs-dist
 *  2. Clean text: strip page boundaries, handle cross-page text duplication
 *  3. Parse ALL message headers (Sent/From/To+FirstViewed/Subject + body)
 *  4. Deduplicate by (sender, timestamp) keeping the longest body version
 *  5. Assign "Message X of Y" numbers to primary messages
 *  6. Convert to SiftDocument format with thread grouping
 */

import type { SiftDocument } from '~/types'

// ── Types ──

export interface OFWParsedMessage {
  sent: string // ISO datetime
  from: string
  to: string
  firstViewed: string | null // ISO datetime
  subject: string
  body: string
  attachments: string[]
  messageNumber: number | null // from "Message X of Y" marker if matched
}

export interface OFWParseResult {
  messages: OFWParsedMessage[]
  totalReportMessages: number // Y from "Message X of Y"
  totalRawHeaders: number // all headers before dedup
  senders: string[]
  dateRange: { start: string; end: string }
  /** Internal: cleaned lines and marker positions for thread grouping */
  _lines: string[]
  _markerPositions: { line: number; num: number; total: number }[]
}

// ── Date parsing ──

function parseOFWDate(dateStr: string, timeStr: string): string {
  // dateStr: "01/14/2026", timeStr: "07:12 AM" or " 7:12 AM"
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

// ── Regex patterns ──
// Note: patterns match the pdfjs-dist text output format

// "Sent: MM/DD/YYYY at HH:MM AM/PM"
const SENT_RE = /^Sent:\s*(\d{2}\/\d{2}\/\d{4})\s+at\s+(\d{1,2}:\d{2}\s+[AP]M)\s*$/

// "From: Name"
const FROM_RE = /^From:\s+(.+)$/

// "To: Name(First Viewed: MM/DD/YYYY at HH:MM AM/PM)"
// pdfjs-dist joins To: and (First Viewed:...) on the same line
const TO_WITH_FV_RE = /^To:\s+(.+?)\(First Viewed:\s*(\d{2}\/\d{2}\/\d{4})\s+at\s+(\d{1,2}:\d{2}\s+[AP]M)\)\s*$/

// "To: Name" (without First Viewed, fallback)
const TO_RE = /^To:\s+(.+)$/

// "Subject: text" or just "Re: text" at page boundaries
const SUBJECT_RE = /^Subject:\s+(.*)$/

// "| Message Report Page X of Y"
const PAGE_HEADER_RE = /^\| Message Report Page \d+ of \d+$/

// Page boundary marker (added by our extraction)
const PAGE_BREAK_RE = /^__PAGE_BREAK__$/

// "Message X of Y"
const MESSAGE_MARKER_RE = /^Message (\d+) of (\d+)$/

// Attachment patterns
const ATTACHMENT_RE = /See Attachments:/

// ── Text extraction from PDF ──

export async function extractTextFromPDF(pdfData: Uint8Array): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')

  const doc = await pdfjsLib.getDocument({ data: pdfData, useSystemFonts: true }).promise

  const pageTexts: string[] = []

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const textContent = await page.getTextContent()

    // Build text from items, using Y-coordinate changes to detect new lines
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

    // Add page boundary marker so the cleaner can detect cross-page text duplication
    pageTexts.push('__PAGE_BREAK__')
  }

  return pageTexts.join('\n')
}

// ── Text cleaning ──

/**
 * Remove PDF page boundary artifacts and handle text duplication
 * at page breaks (where the last line of one page is repeated as the
 * first line of the next page).
 */
function cleanText(rawText: string): string {
  const lines = rawText.split('\n')
  const cleaned: string[] = []
  let lastContentLine: string | null = null
  let skipDuplicateCount = 0 // how many upcoming lines to check for duplicates

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const trimmed = line.trim()

    // Skip page break markers
    if (PAGE_BREAK_RE.test(trimmed)) {
      // After a page break, the next 1-2 non-empty lines might be duplicates
      // of the last line(s) before the break
      skipDuplicateCount = 2
      continue
    }

    // Skip OFW page headers (e.g., "| Message Report Page 5 of 488")
    if (PAGE_HEADER_RE.test(trimmed)) {
      continue
    }

    // After a page break, check for duplicated text
    if (skipDuplicateCount > 0 && trimmed) {
      if (lastContentLine && trimmed === lastContentLine) {
        // Skip the duplicate, but keep checking for more
        skipDuplicateCount--
        continue
      }
      // Non-duplicate content found, stop checking
      skipDuplicateCount = 0
    }

    cleaned.push(line)
    if (trimmed) {
      lastContentLine = trimmed
    }
  }

  return cleaned.join('\n')
}

// ── Attachment parsing ──

function parseAttachmentLine(line: string): string[] {
  // Formats:
  //   "PXL_20260112_042928439.jpg (1.9 MB)See Attachments:"
  //   "See Attachments: PXL_20260116_230203988.jpg (3.4 MB)"
  //   "filename.jpg (2.6 MB), filename2.jpg (6.5 MB)See Attachments:"

  // Remove "See Attachments:" in various positions
  const cleaned = line
    .replace(/See Attachments:\s*/g, '')
    .replace(/\s*See Attachments:?/g, '')
    .trim()

  if (!cleaned) return []

  // Split by comma, extract filenames (strip size info like "(1.9 MB)")
  return cleaned
    .split(',')
    .map(part => part.trim().replace(/\s*\(\d+\.?\d*\s*[KMGT]?B\)\s*$/i, '').trim())
    .filter(name => name.length > 0 && /\.\w{2,4}$/.test(name))
}

// ── Main header extraction ──

interface ParsedHeader {
  sent: string
  from: string
  to: string
  firstViewed: string | null
  subject: string
  bodyLines: string[]
  attachments: string[]
  lineIndex: number
}

/**
 * Extract all message headers and bodies from cleaned text.
 */
function extractAllHeaders(lines: string[]): ParsedHeader[] {
  const entries: ParsedHeader[] = []
  let i = 0

  while (i < lines.length) {
    const trimmed = lines[i]!.trim()

    // Look for a "Sent:" line
    const sentMatch = trimmed.match(SENT_RE)
    if (!sentMatch) {
      i++
      continue
    }

    const sentDate = parseOFWDate(sentMatch[1]!, sentMatch[2]!)
    const headerStart = i

    // Next non-empty line should be "From:"
    let j = i + 1
    while (j < lines.length && !lines[j]!.trim()) j++
    const fromLine = lines[j]?.trim() || ''
    const fromMatch = fromLine.match(FROM_RE)
    if (!fromMatch) {
      i++
      continue
    }
    const from = fromMatch[1]!.trim()

    // Next non-empty line should be "To: Name(First Viewed: ...)"
    j++
    while (j < lines.length && !lines[j]!.trim()) j++
    const toLine = lines[j]?.trim() || ''

    let to: string
    let firstViewed: string | null = null

    const toFvMatch = toLine.match(TO_WITH_FV_RE)
    if (toFvMatch) {
      to = toFvMatch[1]!.trim()
      firstViewed = parseOFWDate(toFvMatch[2]!, toFvMatch[3]!)
    }
    else {
      const toMatch = toLine.match(TO_RE)
      if (!toMatch) {
        i++
        continue
      }
      to = toMatch[1]!.trim()
    }

    // Next non-empty line should be "Subject: ..."
    j++
    while (j < lines.length && !lines[j]!.trim()) j++
    const subjLine = lines[j]?.trim() || ''

    let subject = ''
    const subjMatch = subjLine.match(SUBJECT_RE)
    if (subjMatch) {
      subject = subjMatch[1]?.trim() || ''
      j++
    }
    else if (/^Re:\s+/i.test(subjLine)) {
      // Sometimes subject appears without "Subject:" prefix (page boundary artifact)
      subject = subjLine
      j++
    }
    else {
      // No subject line found — this might not be a valid header
      // But we'll still continue as some messages genuinely have no subject line
      // The subjLine might be the start of the body
    }

    // Collect body text until next Sent: line or Message marker
    const bodyLines: string[] = []
    const attachments: string[] = []

    while (j < lines.length) {
      const bodyLine = lines[j]!
      const bodyTrimmed = bodyLine.trim()

      // Stop at next "Sent:" line (new message header)
      if (SENT_RE.test(bodyTrimmed)) break

      // Stop at "Message X of Y" marker (end of message block)
      if (MESSAGE_MARKER_RE.test(bodyTrimmed)) {
        j++
        break
      }

      // Handle attachment lines
      if (ATTACHMENT_RE.test(bodyTrimmed)) {
        attachments.push(...parseAttachmentLine(bodyTrimmed))
        j++
        continue
      }

      // Skip page break markers that survived cleaning
      if (PAGE_BREAK_RE.test(bodyTrimmed)) {
        j++
        continue
      }

      // Skip leading empty lines in body
      if (bodyLines.length === 0 && !bodyTrimmed) {
        j++
        continue
      }

      // Skip duplicate "Subject: ..." lines at the start of body
      // (these appear when text is duplicated across page boundaries)
      if (bodyLines.length === 0 && subject) {
        const subjContent = bodyTrimmed.replace(/^Subject:\s+/, '')
        if (subjContent === subject || bodyTrimmed === subject) {
          j++
          continue
        }
      }

      bodyLines.push(bodyLine)
      j++
    }

    // Trim trailing empty lines from body
    while (bodyLines.length > 0 && !bodyLines[bodyLines.length - 1]!.trim()) {
      bodyLines.pop()
    }

    entries.push({
      sent: sentDate,
      from,
      to,
      firstViewed,
      subject,
      bodyLines,
      attachments,
      lineIndex: headerStart,
    })

    i = j
  }

  return entries
}

// ── Message number assignment ──

/**
 * Scan for "Message X of Y" markers and assign numbers to the appropriate
 * parsed message.
 *
 * Between consecutive markers, the text contains:
 *  1. (Optional) Thread context overflow from the PREVIOUS message
 *  2. The current message's unique/new message (NEWEST timestamp)
 *  3. The current message's thread context (older timestamps)
 *
 * Strategy: Find all Sent: headers between markers and pick the one
 * with the NEWEST timestamp — that's the unique message for this entry.
 */
function findMarkerPositions(lines: string[]): { line: number; num: number; total: number }[] {
  const positions: { line: number; num: number; total: number }[] = []
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]!.trim().match(MESSAGE_MARKER_RE)
    if (match) {
      positions.push({
        line: i,
        num: parseInt(match[1]!, 10),
        total: parseInt(match[2]!, 10),
      })
    }
  }
  return positions
}

function assignMessageNumbers(
  lines: string[],
  markerPositions: { line: number; num: number; total: number }[],
  messages: OFWParsedMessage[],
): number {
  const lookup = new Map<string, OFWParsedMessage>()
  for (const msg of messages) {
    lookup.set(`${msg.from}|${msg.sent}`, msg)
  }

  let totalMessages = 0

  for (let idx = 0; idx < markerPositions.length; idx++) {
    const marker = markerPositions[idx]!
    totalMessages = Math.max(totalMessages, marker.total)

    const regionStart = idx > 0 ? markerPositions[idx - 1]!.line + 1 : 0
    const regionEnd = marker.line

    let newestTimestamp = ''
    let newestFrom = ''
    let newestSent = ''

    for (let k = regionStart; k < regionEnd; k++) {
      const sentMatch = lines[k]!.trim().match(SENT_RE)
      if (!sentMatch) continue

      const sent = parseOFWDate(sentMatch[1]!, sentMatch[2]!)

      let fromName = ''
      for (let m = k + 1; m < regionEnd && m < k + 5; m++) {
        const fromMatch = lines[m]!.trim().match(FROM_RE)
        if (fromMatch) {
          fromName = fromMatch[1]!.trim()
          break
        }
      }

      if (sent > newestTimestamp) {
        newestTimestamp = sent
        newestFrom = fromName
        newestSent = sent
      }
    }

    if (newestFrom && newestSent) {
      const key = `${newestFrom}|${newestSent}`
      const msg = lookup.get(key)
      if (msg && msg.messageNumber === null) {
        msg.messageNumber = marker.num
      }
    }
  }

  return totalMessages
}

// ── Deduplication ──

function deduplicateMessages(entries: ParsedHeader[]): OFWParsedMessage[] {
  const uniqueMap = new Map<string, OFWParsedMessage>()

  for (const entry of entries) {
    const body = entry.bodyLines.join('\n').trim()
    const key = `${entry.from}|${entry.sent}`
    const existing = uniqueMap.get(key)

    const msg: OFWParsedMessage = {
      sent: entry.sent,
      from: entry.from,
      to: entry.to,
      firstViewed: entry.firstViewed,
      subject: entry.subject || existing?.subject || '',
      body,
      attachments: entry.attachments.length > 0 ? entry.attachments : (existing?.attachments || []),
      messageNumber: null,
    }

    if (!existing || body.length > existing.body.length) {
      // Keep longer body (handles truncation in thread context)
      if (!msg.subject && existing?.subject) msg.subject = existing.subject
      if (msg.attachments.length === 0 && existing?.attachments?.length) msg.attachments = existing.attachments
      uniqueMap.set(key, msg)
    }
    else {
      // Keep existing but merge any new info
      if (entry.attachments.length > 0 && existing.attachments.length === 0) {
        existing.attachments = entry.attachments
      }
      if (!existing.subject && entry.subject) {
        existing.subject = entry.subject
      }
    }
  }

  return Array.from(uniqueMap.values())
}

// ── Thread grouping ──

function slugifySubject(subject: string): string {
  const base = subject.replace(/^(Re:\s*)+/i, '').trim()
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'untitled'
}

// ── Union-Find ──

class UnionFind {
  private parent = new Map<string, string>()

  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x)
    // Path compression
    while (this.parent.get(x) !== x) {
      this.parent.set(x, this.parent.get(this.parent.get(x)!)!)
      x = this.parent.get(x)!
    }
    return x
  }

  union(a: string, b: string): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent.set(ra, rb)
  }

  groups(): Map<string, string[]> {
    const result = new Map<string, string[]>()
    for (const key of this.parent.keys()) {
      const root = this.find(key)
      if (!result.has(root)) result.set(root, [])
      result.get(root)!.push(key)
    }
    return result
  }
}

/**
 * Build thread groups using OFW's text structure.
 *
 * In OFW's thread view, messages appear in REVERSE chronological order
 * (newest first, oldest last). When a new thread entry begins, the
 * timestamp JUMPS FORWARD. We exploit this:
 *
 *   Walk all consecutive Sent: headers in the text. If the timestamp
 *   is non-increasing (same or older), the messages are part of the same
 *   reply chain → union them. If the timestamp jumps forward, it's a new
 *   thread entry → don't union.
 *
 * This naturally handles:
 *  - Thread context (reverse chrono) → all unioned
 *  - Overflow past markers → continues reverse chrono, stays connected
 *  - New entry after overflow → timestamp jumps forward, correctly separated
 *  - Two threads with same subject → different reply chains, never adjacent
 *    in reverse chrono, so they stay in separate union-find components
 */
function buildThreadGroups(
  lines: string[],
  _markerPositions: { line: number; num: number; total: number }[],
  messages: OFWParsedMessage[],
): Map<string, string> {
  const uf = new UnionFind()

  // Register all messages
  for (const msg of messages) {
    uf.find(`${msg.from}|${msg.sent}`)
  }

  // Walk all Sent: headers in text order and union adjacent reverse-chrono pairs
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

  // Union adjacent pairs where timestamps are non-increasing (same thread)
  for (let i = 1; i < allHeaders.length; i++) {
    const prev = allHeaders[i - 1]!
    const curr = allHeaders[i]!
    // Reverse chronological order (or equal) → same thread
    if (curr.sent <= prev.sent) {
      uf.union(prev.key, curr.key)
    }
    // If curr.sent > prev.sent → timestamp jumped forward = new thread entry
  }

  // Build groups and assign thread IDs
  const groups = uf.groups()
  const msgToThread = new Map<string, string>()

  const msgLookup = new Map<string, OFWParsedMessage>()
  for (const msg of messages) {
    msgLookup.set(`${msg.from}|${msg.sent}`, msg)
  }

  // Track slug usage for disambiguation
  const slugUsage = new Map<string, number>()

  const groupInfos: { members: string[]; slug: string; oldest: string }[] = []
  for (const [, memberKeys] of groups) {
    // Find the oldest message in the group — that's the thread root
    let oldestSent = '\uffff'
    let rootSubject = ''
    for (const key of memberKeys) {
      const msg = msgLookup.get(key)
      if (msg && msg.sent < oldestSent) {
        oldestSent = msg.sent
        rootSubject = msg.subject
      }
    }
    const slug = slugifySubject(rootSubject)
    groupInfos.push({ members: memberKeys, slug, oldest: oldestSent })
    slugUsage.set(slug, (slugUsage.get(slug) || 0) + 1)
  }

  // Sort by oldest message so the first occurrence of a slug gets the clean name
  groupInfos.sort((a, b) => a.oldest.localeCompare(b.oldest))

  // Assign thread IDs, disambiguating when needed
  const slugCounter = new Map<string, number>()
  for (const group of groupInfos) {
    const count = slugCounter.get(group.slug) || 0
    slugCounter.set(group.slug, count + 1)

    const needsDisambiguation = (slugUsage.get(group.slug) || 0) > 1
    const threadId = needsDisambiguation && count > 0
      ? `${group.slug}-${count + 1}`
      : group.slug

    for (const key of group.members) {
      msgToThread.set(key, threadId)
    }
  }

  return msgToThread
}

// ── Public API ──

/**
 * Parse raw text from an OFW Message Report PDF.
 * The text should come from extractTextFromPDF().
 */
export function parseOFWText(rawText: string): OFWParseResult {
  // Step 1: Clean the text
  const cleaned = cleanText(rawText)
  const lines = cleaned.split('\n')

  // Step 2: Extract all message headers and bodies
  const allEntries = extractAllHeaders(lines)

  // Step 3: Deduplicate by (from, sent)
  const messages = deduplicateMessages(allEntries)

  // Step 4: Sort chronologically
  messages.sort((a, b) => a.sent.localeCompare(b.sent))

  // Step 5: Find marker positions and assign message numbers
  const markerPositions = findMarkerPositions(lines)
  const totalReportMessages = assignMessageNumbers(lines, markerPositions, messages)

  // Step 6: Collect metadata
  const senders = [...new Set(messages.map(m => m.from))]
  const timestamps = messages.map(m => m.sent).sort()

  return {
    messages,
    totalReportMessages,
    totalRawHeaders: allEntries.length,
    senders,
    dateRange: {
      start: timestamps[0] || '',
      end: timestamps[timestamps.length - 1] || '',
    },
    _lines: lines,
    _markerPositions: markerPositions,
  }
}

/**
 * Full pipeline: PDF binary → SiftDocument[]
 */
export async function parseOFWPdf(pdfData: Uint8Array): Promise<{
  documents: SiftDocument[]
  parseResult: OFWParseResult
}> {
  const text = await extractTextFromPDF(pdfData)
  const parseResult = parseOFWText(text)
  const documents = toSiftDocuments(parseResult)
  return { documents, parseResult }
}

/**
 * Convert parsed OFW messages to SiftDocument format.
 */
export function toSiftDocuments(parsed: OFWParseResult): SiftDocument[] {
  // Build thread groups from OFW's actual reply-chain structure
  const threadMap = buildThreadGroups(
    parsed._lines,
    parsed._markerPositions,
    parsed.messages,
  )

  // Messages are already sorted chronologically — assign sequential numbers
  return parsed.messages.map((msg, i) => {
    const key = `${msg.from}|${msg.sent}`
    const threadId = threadMap.get(key) || slugifySubject(msg.subject)

    return {
      id: `doc-${String(i + 1).padStart(3, '0')}`,
      source: 'ofw' as const,
      timestamp: msg.sent,
      text: msg.body,
      metadata: {
        sender: msg.from,
        recipient: msg.to,
        thread_id: threadId,
        subject: msg.subject || undefined,
        word_count: msg.body.split(/\s+/).filter(w => w).length,
        message_number: i + 1,
      },
    }
  })
}
