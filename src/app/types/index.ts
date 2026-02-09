// ── Core Data Model ──

export type ToneLabel = 'hostile' | 'neutral' | 'cooperative'
export type DocumentSource = 'ofw' | 'email' | 'text' | 'pdf'

export interface Span {
  doc_id: string
  start: number
  end: number
  text: string
}

export interface DocumentMeta {
  sender: string
  recipient: string
  thread_id?: string
  subject?: string
  word_count: number
  message_number?: number
}

export interface SiftDocument {
  id: string
  source: DocumentSource
  timestamp: string // ISO datetime
  text: string
  metadata: DocumentMeta
}

export interface DocumentLabel {
  label: ToneLabel
  confidence: number
  rationale_spans: Span[]
}

export interface LabelSet {
  labels: Record<string, DocumentLabel>
}

export interface DocSetFilter {
  op: string
  args: Record<string, unknown>
  timestamp: string
}

export interface DocSet {
  doc_ids: string[]
  filters_applied: DocSetFilter[]
  stats: {
    count: number
    date_range: [string, string]
    senders: string[]
  }
}

// ── API Types ──

export interface CorpusStats {
  total_documents: number
  senders: { name: string; count: number }[]
  date_range: { start: string; end: string }
  llm_spend: number
  volume_by_month: { month: string; sender: string; count: number }[]
  tone_distribution: { sender: string; hostile: number; neutral: number; cooperative: number }[]
  has_tone_analysis: boolean
}

export interface MessageListItem {
  id: string
  sender: string
  recipient: string
  timestamp: string
  text: string
  preview: string
  tone: ToneLabel | null
  confidence: number | null
  word_count: number
  message_number?: number
  thread_id?: string
  subject?: string
}

export interface MessageDetail extends MessageListItem {
  context_before: MessageListItem[]
  context_after: MessageListItem[]
}

export interface MessagesResponse {
  messages: MessageListItem[]
  total: number
  senders: string[]
}

// ── Thread Types ──

export interface ThreadSummary {
  thread_id: string
  subject: string
  message_count: number
  date_range: { start: string; end: string }
  senders: string[]
  tone_summary: { hostile: number; neutral: number; cooperative: number }
  last_message_preview: string
  last_message_sender: string
  last_message_timestamp: string
}

export interface ThreadsResponse {
  threads: ThreadSummary[]
  total: number
}

export interface ThreadDetailResponse {
  thread_id: string
  subject: string
  messages: MessageListItem[]
  senders: string[]
}

export interface ExecutionStep {
  id: string
  op: string
  tier: 1 | 2 | 3
  args: Record<string, unknown>
  result_count: number | null
  cost: number
  duration_ms: number
  status: 'pending' | 'running' | 'complete' | 'error'
}

export interface QueryResult {
  answer: string
  citations: { doc_id: string; message_number?: number; preview: string }[]
  execution_plan: ExecutionStep[]
  total_cost: number
  documents_touched: number
}

export interface TimelineEvent {
  id: string
  title: string
  description: string
  date: string
  tone: ToneLabel
  source_doc_ids: string[]
  source_message_numbers: number[]
  topic: string
}

export interface TimelineResponse {
  events: TimelineEvent[]
  title: string
  date_range: { start: string; end: string }
  total_source_docs: number
  topics: string[]
}

export interface ExportPreview {
  format: 'html' | 'csv' | 'json'
  row_count: number
  preview_content: string
  estimated_size: string
}
