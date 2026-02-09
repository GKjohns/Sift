# Sift — Product Spec

## What This Is

Sift is a document intelligence tool that lets you query, label, and compute over large collections of unstructured text. Think of it as `pandas` for documents — composable operations where the LLM is just another `.apply()` function, used sparingly after cheap deterministic filters have narrowed the work surface.

The first target corpus is Our Family Wizard (OFW) message exports — PDF dumps of co-parenting communication used in custody proceedings. But the architecture is source-agnostic. Any collection of timestamped text documents (emails, texts, court filings) should plug into the same op layer.

**The core principle:** deterministic first, LLM last. Every dollar of LLM spend should touch the smallest possible set of documents, pre-filtered by fast SQL and keyword operations that cost nothing.

---

## Architecture Overview

```
Sources (PDF, CSV, etc.)
    ↓
Ingest → parse into Documents (source-specific parsers)
    ↓
Store → SQLite (structured queries, FTS5) + vector DB (semantic search)
    ↓
Op Engine → composable operations, each returning a DocSet with audit trail
    ↓
Agent → decomposes natural language into op chains via tool-use
    ↓
UI → dashboard with views for exploration, analysis, and evidence packaging
```

**Stack:** Nuxt 3, Nuxt UI, SQLite (via `sql.js` or server route to `better-sqlite3`), a lightweight vector store (could be in-memory with `transformers.js` or a server-side ChromaDB call), Anthropic API for LLM ops.

For this proof of concept, everything can run client-side or with minimal server routes. No auth, no persistent DB, no user accounts. Upload a file, parse it, explore it.

---

## Data Model

Four objects flow through the entire system:

**Document** — A single unit of text with metadata. For OFW, this is one message. For a PDF custody agreement, it might be a section or paragraph.

```
{
  id: string
  source: "ofw" | "email" | "text" | "pdf"
  timestamp: datetime
  text: string
  metadata: { sender, recipient, thread_id, subject, word_count, ... }
}
```

**Span** — A substring of a document. This is how citations work. Every claim maps back to a span.

```
{
  doc_id: string
  start: int
  end: int
  text: string
}
```

**DocSet** — A filtered collection of documents, plus the audit trail of how it was produced. This is the primary thing that flows between operations.

```
{
  doc_ids: string[]
  filters_applied: { op, args, timestamp }[]
  stats: { count, date_range, senders, ... }
}
```

**LabelSet** — LLM-generated classifications attached to documents, always with confidence scores and rationale spans.

```
{
  labels: { [doc_id]: { label: string, confidence: float, rationale_spans: Span[] } }
}
```

---

## Operations (The Tool Set)

The agent has access to these operations as tools. They're organized by cost tier.

### Tier 1 — Free (SQL / string matching)

| Op | What it does |
|---|---|
| `filter_metadata(where)` | Filter by sender, date range, source, word count, etc. |
| `search_lex(terms, mode)` | Keyword search. Modes: any, all, phrase. Returns spans. |
| `search_regex(pattern)` | Regex over document text. For dollar amounts, dates, structured patterns. |
| `top_k(docset, by, k)` | Take the top K docs by timestamp or relevance. Caps set size before expensive ops. |
| `sample(docset, n, strategy)` | Random, stratified, or recent sample. For spot-checks and bootstrapping. |
| `get_context(doc_id, window)` | Retrieve surrounding documents for conversational context. |

### Tier 2 — Cheap (embeddings)

| Op | What it does |
|---|---|
| `search_semantic(query, k)` | Embedding similarity search. Returns approximate top-K, not exhaustive. |
| `cluster(docset)` | Group documents by theme. Returns clusters with representative samples. |

### Tier 3 — Expensive (LLM per document)

| Op | What it does |
|---|---|
| `label(docset, schema, budget)` | Classify documents into categories with confidence scores. Batches 10-20 per API call. |
| `extract(docset, schema)` | Pull structured fields: commitments, dates, claims, violations. Returns spans. |
| `filter_by_label(labelset, condition)` | Filter on LLM-generated labels. e.g., `tone == "hostile" AND confidence > 0.7` |

### Aggregation (runs over any DocSet or LabelSet)

| Op | What it does |
|---|---|
| `count(docset, by)` | Count by sender, day, week, label, entity. |
| `trend(docset, metric, interval)` | Metric over time. Hostile messages per week, response frequency per month. |
| `timeline(docset, event_schema)` | Extract events, order chronologically, attach citations. |

**Budget enforcement:** Every Tier 3 operation checks a budget before executing. If the DocSet is too large, the system suggests: sample a subset, tighten filters, or proceed with a cost estimate. The UI should surface this decision to the user.

---

## Dashboard Views

The app is a single-page dashboard with a persistent header (logo, corpus info badge, export button, query input) and a tabbed view selector. Five views:

### 1. Overview

The landing page after uploading a corpus. At a glance: what's in here?

**Components:**
- **Stat cards row** — Total documents, count per sender, average response time, date range covered
- **Volume chart** — Messages per month, stacked or grouped by sender. Simple bar chart.
- **Tone distribution** — Horizontal stacked bars per sender showing hostile / neutral / cooperative breakdown (this requires a pre-computed label run, or shows as empty with a "Run analysis" prompt if labels haven't been generated yet)
- **Cost badge** — Small element showing total LLM spend so far on this corpus. Keeps the user aware.

**Behavior:** Stat cards and volume chart populate immediately from metadata (Tier 1). Tone distribution populates after a labeling run. This view should make clear what's computed vs. what requires an LLM pass.

### 2. Messages

A searchable, filterable list of all documents in the corpus.

**Components:**
- **Filter bar** — Buttons or toggles for tone labels (all / hostile / neutral / cooperative), sender filter, date range picker
- **Message list** — Each row shows: sender avatar (initial), sender name, message ID, timestamp, body preview (truncated), tone badge with confidence percentage
- **Click-to-expand** — Clicking a message shows full text + context window (surrounding messages). This is where you'd read the actual exchange.

**Behavior:** The list is filterable by any combination of metadata and labels. Keyword search input at the top does `search_lex` and highlights matching spans in the preview. Default sort is chronological.

### 3. Query

The natural language interface. This is where the agent lives.

**Components:**
- **Query input** — Large text input at the top. Examples as placeholder or suggestion chips below: "Find messages where scheduling was contentious", "How many messages mention the word 'lawyer'?", "Is there a pattern of one parent being less responsive?"
- **Execution plan** — As the agent runs, show each operation as a step in a vertical pipeline: op name, arguments, result count, cost, time. Use the connected-dots / pipeline visual from the mockup. Steps are color-coded: green border for LLM ops, gray for free ops.
- **Result** — The agent's final answer, rendered as prose with inline citations. Citations are clickable and jump to the message in the Messages view. Below the answer: a summary card showing total operations, documents touched, and cost.

**Behavior:** When a query is submitted, the agent decomposes it into tool calls. Each tool call appears in the execution plan in real-time (or sequentially as they complete). The user sees exactly what the system is doing and why. This transparency is a core differentiator — it's not a black box.

### 4. Timeline

A chronological event view extracted from the corpus. Optimized for the legal use case where you need "what happened and when, with citations."

**Components:**
- **Timeline header** — Title (editable, e.g., "Scheduling Disputes"), event count, source message count, date range
- **Event list** — Vertical timeline with date markers on the left, event cards on the right. Each card: title, one-sentence description, tone indicator (colored dot), and citation badges linking to source messages (`Msg #142`, `Msg #143`)
- **Filters** — Filter timeline by topic, sender, tone. Re-running the timeline extraction with different parameters produces a different view.

**Behavior:** Timeline events are produced by the `timeline` op — an LLM extraction that identifies discrete events from a DocSet and orders them chronologically. Each event must cite source documents. The user can select a subset of the corpus first (e.g., only messages about scheduling) and then generate a timeline from that subset.

### 5. Export

Package everything into a deliverable. For the POC, this can be simple.

**Components:**
- **Format selector** — HTML (pretty-printed thread), CSV (structured message data), JSON (full data dump with labels and audit trail)
- **Scope selector** — Export all, export current filter/DocSet, export timeline
- **Include options** — Checkboxes: include labels, include audit trail (op chain), include tone analysis
- **Preview** — Show a preview of the first page / few rows of the export before downloading
- **Download button**

**Behavior:** The HTML export is the "pretty OFW" feature — converts the ugly PDF into a clean, readable thread with message IDs, sender colors, and date dividers. The CSV/JSON exports include all metadata and any computed labels. The audit trail option appends the full chain of operations that produced the current view, for reproducibility.

---

## Upload Flow

On first load, the user sees a centered upload zone:

1. Drag or select a PDF (OFW export)
2. Progress indicator: "Parsing... found 487 messages"
3. Progress indicator: "Indexing... building search index"
4. Progress indicator: "Embedding... computing vectors" (this is the slow step, ~30s for 500 messages with a small model)
5. Redirect to Overview

For the POC, support OFW PDF only. The parser is regex-based and tuned to the OFW export format. A "format not recognized" error with guidance should appear if the PDF doesn't match expected patterns.

---

## Design Notes

**Aesthetic:** Light, airy, warm. White/cream backgrounds with a gentle sage green (`#4a9e6e`) as primary. Warm sandy tints on surfaces. Dark mode uses warm soil tones, not cold blacks. See `sift-app.css` for the full token set.

**Typography:** Clean sans-serif for UI, monospace for data elements (message IDs, op names, code). Nothing flashy.

**Tone of the product:** Precise, trustworthy, transparent. Every number has a source. Every claim has a citation. The execution plan view exists specifically so users never wonder "where did this come from?" This is a tool for high-stakes contexts (custody, legal) — it needs to feel like an instrument, not a toy.

---

## What's NOT In This POC

- Authentication or user accounts
- Persistent storage (everything lives in memory / browser for now)
- Multi-source ingest (emails, texts, court docs — later)
- Pre-computed labels at ingest
- Collaborative features
- Report generation (auto-generated GAL summaries — this is a future killer feature)
- Real-time streaming of agent responses (nice-to-have, not blocking)