/**
 * Server-side in-memory corpus store.
 *
 * Holds parsed documents and labels in memory so all API routes can
 * access them without re-parsing or hitting a database.
 * Will be replaced with proper persistence later.
 */

import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { SiftDocument, DocumentLabel, MessageListItem, CorpusStats, ThreadSummary } from '~/types'

interface CorpusData {
  documents: SiftDocument[]
  labels: Record<string, DocumentLabel>
  messages: MessageListItem[]
  threads: ThreadSummary[]
  stats: CorpusStats
  filename: string
}

let _corpus: CorpusData | null = null

const CORPUS_PATH = join(process.cwd(), '.data', 'corpus.json')

async function persistCorpusToDisk(data: CorpusData) {
  await mkdir(dirname(CORPUS_PATH), { recursive: true })
  await writeFile(CORPUS_PATH, JSON.stringify(data), 'utf8')
}

async function loadCorpusFromDisk(): Promise<CorpusData | null> {
  try {
    const raw = await readFile(CORPUS_PATH, 'utf8')
    return JSON.parse(raw) as CorpusData
  }
  catch {
    return null
  }
}

export async function getCorpus(): Promise<CorpusData | null> {
  if (_corpus) return _corpus
  _corpus = await loadCorpusFromDisk()
  return _corpus
}

export async function setCorpus(data: CorpusData): Promise<void> {
  _corpus = data
  await persistCorpusToDisk(data)
}

export async function clearCorpus(): Promise<void> {
  _corpus = null
  try {
    await unlink(CORPUS_PATH)
  }
  catch {
    // ignore
  }
}

export async function isCorpusLoaded(): Promise<boolean> {
  return (await getCorpus()) !== null
}

/**
 * Build MessageListItem[] from SiftDocuments (no tone labels initially).
 */
export function buildMessageListFromDocs(docs: SiftDocument[]): MessageListItem[] {
  return docs.map(doc => ({
    id: doc.id,
    sender: doc.metadata.sender,
    recipient: doc.metadata.recipient,
    timestamp: doc.timestamp,
    text: doc.text,
    preview: doc.text.length > 120 ? doc.text.substring(0, 120) + '...' : doc.text,
    tone: null,
    confidence: null,
    word_count: doc.metadata.word_count,
    message_number: doc.metadata.message_number,
    thread_id: doc.metadata.thread_id,
    subject: doc.metadata.subject,
  }))
}

/**
 * Build ThreadSummary[] from documents.
 */
export function buildThreadSummariesFromDocs(docs: SiftDocument[]): ThreadSummary[] {
  const threads = new Map<string, SiftDocument[]>()

  for (const doc of docs) {
    const tid = doc.metadata.thread_id || doc.id
    if (!threads.has(tid)) threads.set(tid, [])
    threads.get(tid)!.push(doc)
  }

  const summaries: ThreadSummary[] = []

  for (const [threadId, threadDocs] of threads) {
    threadDocs.sort((a, b) => a.timestamp.localeCompare(b.timestamp))

    const senders = [...new Set(threadDocs.map(d => d.metadata.sender))]
    const timestamps = threadDocs.map(d => d.timestamp).sort()
    const lastDoc = threadDocs[threadDocs.length - 1]!
    const firstDoc = threadDocs[0]!

    summaries.push({
      thread_id: threadId,
      subject: firstDoc.metadata.subject?.replace(/^Re:\s*/i, '') || 'Untitled Thread',
      message_count: threadDocs.length,
      date_range: { start: timestamps[0]!, end: timestamps[timestamps.length - 1]! },
      senders,
      tone_summary: { hostile: 0, neutral: 0, cooperative: 0 },
      last_message_preview: lastDoc.text.length > 120 ? lastDoc.text.substring(0, 120) + '...' : lastDoc.text,
      last_message_sender: lastDoc.metadata.sender,
      last_message_timestamp: lastDoc.timestamp,
    })
  }

  summaries.sort((a, b) => b.last_message_timestamp.localeCompare(a.last_message_timestamp))
  return summaries
}

/**
 * Build CorpusStats from documents.
 */
export function buildCorpusStatsFromDocs(docs: SiftDocument[]): CorpusStats {
  const senderCounts: Record<string, number> = {}
  const monthCounts: Record<string, Record<string, number>> = {}

  for (const doc of docs) {
    senderCounts[doc.metadata.sender] = (senderCounts[doc.metadata.sender] || 0) + 1

    const month = doc.timestamp.substring(0, 7)
    if (!monthCounts[month]) monthCounts[month] = {}
    monthCounts[month]![doc.metadata.sender] = (monthCounts[month]![doc.metadata.sender] || 0) + 1
  }

  const timestamps = docs.map(d => d.timestamp).sort()

  return {
    total_documents: docs.length,
    senders: Object.entries(senderCounts).map(([name, count]) => ({ name, count })),
    date_range: {
      start: timestamps[0]!,
      end: timestamps[timestamps.length - 1]!,
    },
    llm_spend: 0,
    volume_by_month: Object.entries(monthCounts).flatMap(([month, senders]) =>
      Object.entries(senders).map(([sender, count]) => ({ month, sender, count })),
    ).sort((a, b) => a.month.localeCompare(b.month)),
    tone_distribution: Object.entries(senderCounts).map(([sender]) => ({
      sender,
      hostile: 0,
      neutral: 0,
      cooperative: 0,
    })),
    has_tone_analysis: false,
  }
}
