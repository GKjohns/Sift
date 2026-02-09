import type { ExecutionStep, QueryResult } from '~/types'

// Fake query execution with simulated pipeline steps
const QUERY_RESPONSES: Record<string, () => QueryResult> = {
  'scheduling': () => ({
    answer: 'There were **4 scheduling-related threads** found in the corpus, containing 18 messages total. The most contentious was the weekend swap request on January 5, 2025, where David refused Sarah\'s request to swap weekends, escalating to invoking the custody agreement. The spring break discussion (February 20) started with a disagreement about terms but resolved cooperatively with a one-day compromise. The July 4th exchange was entirely cooperative.\n\nOverall pattern: scheduling disputes tend to start contentious but often resolve when both parties reference the custody agreement directly.',
    citations: [
      { doc_id: 'doc-001', message_number: 1, preview: 'Hi David, I need to swap weekends this month...' },
      { doc_id: 'doc-004', message_number: 4, preview: 'I refuse to keep rearranging my life every time...' },
      { doc_id: 'doc-016', message_number: 16, preview: 'I\'d like to take the kids to my parents\' place in Florida...' },
      { doc_id: 'doc-020', message_number: 20, preview: 'That works for me. I\'ll book flights back on the 26th...' }
    ],
    execution_plan: [
      { id: 'step-1', op: 'search_lex', tier: 1, args: { terms: ['schedule', 'swap', 'weekend', 'spring break', 'holiday'], mode: 'any' }, result_count: 22, cost: 0, duration_ms: 12, status: 'complete' },
      { id: 'step-2', op: 'filter_metadata', tier: 1, args: { thread_ids: ['sched-001', 'sched-002', 'sched-003'] }, result_count: 18, cost: 0, duration_ms: 3, status: 'complete' },
      { id: 'step-3', op: 'label', tier: 3, args: { schema: 'tone', budget: 0.05 }, result_count: 18, cost: 0.03, duration_ms: 2100, status: 'complete' },
      { id: 'step-4', op: 'trend', tier: 1, args: { metric: 'tone', interval: 'thread' }, result_count: 4, cost: 0, duration_ms: 8, status: 'complete' }
    ],
    total_cost: 0.03,
    documents_touched: 18
  }),
  'lawyer': () => ({
    answer: 'The word **"lawyer"** appears in **1 message** in the corpus.\n\nMessage #26 (March 9, 2025) from Sarah Mitchell: *"If it happens again, I will involve my lawyer."* This was in the context of a late custody exchange where David returned the children over 2 hours late without answering his phone.\n\nThis is the only direct mention of legal counsel in the entire corpus. However, there are 2 additional messages that reference the custody agreement or court-related language without using the word "lawyer" specifically.',
    citations: [
      { doc_id: 'doc-026', message_number: 26, preview: 'It\'s not about the party. It\'s about not answering your phone...' },
      { doc_id: 'doc-004', message_number: 4, preview: 'The custody agreement is clear.' },
      { doc_id: 'doc-017', message_number: 17, preview: 'Please re-read Section 4.2.' }
    ],
    execution_plan: [
      { id: 'step-1', op: 'search_lex', tier: 1, args: { terms: ['lawyer'], mode: 'any' }, result_count: 1, cost: 0, duration_ms: 5, status: 'complete' },
      { id: 'step-2', op: 'search_lex', tier: 1, args: { terms: ['attorney', 'court', 'custody agreement', 'legal'], mode: 'any' }, result_count: 3, cost: 0, duration_ms: 7, status: 'complete' },
      { id: 'step-3', op: 'get_context', tier: 1, args: { doc_id: 'doc-026', window: 3 }, result_count: 5, cost: 0, duration_ms: 2, status: 'complete' }
    ],
    total_cost: 0,
    documents_touched: 5
  }),
  'hostile': () => ({
    answer: 'There are **14 messages classified as hostile** in the corpus (23.7% of all messages). The hostile messages cluster around three main conflict areas:\n\n1. **Scheduling disputes** (5 messages) — The January weekend swap request generated the most heated exchange.\n2. **Custody exchange violations** (3 messages) — The March 8 late return was the most hostile single thread.\n3. **Expense disagreements** (3 messages) — The glasses expense dispute showed passive hostility.\n\n**By sender:** Sarah Mitchell authored 7 hostile messages and David Mitchell authored 7. The hostility is roughly symmetric.\n\n**Trend:** Hostile messages decreased over time. January-March had 9 hostile messages; April-June had only 5. This suggests improving communication patterns.',
    citations: [
      { doc_id: 'doc-004', message_number: 4, preview: 'I refuse to keep rearranging my life...' },
      { doc_id: 'doc-024', message_number: 24, preview: 'This is completely unacceptable...' },
      { doc_id: 'doc-026', message_number: 26, preview: 'That\'s irresponsible. If it happens again...' },
      { doc_id: 'doc-007', message_number: 7, preview: 'This is the third time this semester...' }
    ],
    execution_plan: [
      { id: 'step-1', op: 'label', tier: 3, args: { schema: 'tone', budget: 0.10 }, result_count: 59, cost: 0.08, duration_ms: 4200, status: 'complete' },
      { id: 'step-2', op: 'filter_by_label', tier: 1, args: { condition: 'tone == "hostile" AND confidence > 0.7' }, result_count: 14, cost: 0, duration_ms: 4, status: 'complete' },
      { id: 'step-3', op: 'count', tier: 1, args: { by: 'sender' }, result_count: 2, cost: 0, duration_ms: 2, status: 'complete' },
      { id: 'step-4', op: 'trend', tier: 1, args: { metric: 'hostile_count', interval: 'month' }, result_count: 6, cost: 0, duration_ms: 5, status: 'complete' }
    ],
    total_cost: 0.08,
    documents_touched: 59
  }),
  'responsive': () => ({
    answer: 'Analyzing response patterns between the two parents:\n\n**Average response time:**\n- Sarah Mitchell: **42 minutes** average\n- David Mitchell: **67 minutes** average\n\n**David is slower to respond**, particularly in threads he initiates that receive pushback. His longest gap was **14 hours** (overnight, January 5-6) after Sarah asked him to reduce hostility in the scheduling dispute.\n\nHowever, in urgent situations (e.g., Jake\'s ER visit on June 5), David\'s communication was **immediate and consistent** — updating Sarah within 5 minutes and continuing updates throughout.\n\n**Pattern:** David tends to delay responses when the conversation turns confrontational, while Sarah maintains consistent response times regardless of tone. This isn\'t necessarily "less responsive" — it may indicate a conflict avoidance strategy.',
    citations: [
      { doc_id: 'doc-005', message_number: 5, preview: 'I\'m not trying to rearrange your life...' },
      { doc_id: 'doc-051', message_number: 51, preview: 'Jake fell off the monkey bars at the park...' },
      { doc_id: 'doc-053', message_number: 53, preview: 'Main entrance, pediatric ER is to the left...' }
    ],
    execution_plan: [
      { id: 'step-1', op: 'filter_metadata', tier: 1, args: { group_by: 'thread_id' }, result_count: 59, cost: 0, duration_ms: 8, status: 'complete' },
      { id: 'step-2', op: 'extract', tier: 3, args: { schema: 'response_time' }, result_count: 47, cost: 0.06, duration_ms: 3100, status: 'complete' },
      { id: 'step-3', op: 'count', tier: 1, args: { by: 'sender', metric: 'avg_response_minutes' }, result_count: 2, cost: 0, duration_ms: 3, status: 'complete' },
      { id: 'step-4', op: 'trend', tier: 1, args: { metric: 'response_time', interval: 'month', by: 'sender' }, result_count: 12, cost: 0, duration_ms: 6, status: 'complete' }
    ],
    total_cost: 0.06,
    documents_touched: 47
  }),
  'topics': () => ({
    answer: 'The most frequent topics in the corpus, ranked by message volume:\n\n1. **Scheduling & Custody Exchanges** — 21 messages (35.6%). The dominant topic. Includes weekend swaps, holiday planning, spring break, and late exchanges.\n2. **School & Education** — 12 messages (20.3%). Teacher meetings, homework coordination, pickup logistics.\n3. **Medical & Health** — 11 messages (18.6%). Dentist appointments, ER visit for Jake\'s fracture, glasses prescription.\n4. **Activities & Expenses** — 10 messages (16.9%). Soccer registration, summer camp, expense splitting.\n5. **General Co-parenting** — 5 messages (8.5%). Meta-communication about communication styles, documentation threats.\n\nNotably, **medical threads have the highest cooperation rate** (82% cooperative messages), while **scheduling threads have the highest hostility rate** (39% hostile).',
    citations: [
      { doc_id: 'doc-001', message_number: 1, preview: 'Hi David, I need to swap weekends this month...' },
      { doc_id: 'doc-031', message_number: 31, preview: 'Mrs. Chen wants to meet with us about Emma\'s reading...' },
      { doc_id: 'doc-051', message_number: 51, preview: 'Jake fell off the monkey bars at the park...' },
      { doc_id: 'doc-027', message_number: 27, preview: 'Spring soccer registration closes Friday...' }
    ],
    execution_plan: [
      { id: 'step-1', op: 'cluster', tier: 2, args: { method: 'topic' }, result_count: 5, cost: 0.02, duration_ms: 1800, status: 'complete' },
      { id: 'step-2', op: 'count', tier: 1, args: { by: 'cluster' }, result_count: 5, cost: 0, duration_ms: 3, status: 'complete' },
      { id: 'step-3', op: 'label', tier: 3, args: { schema: 'tone', budget: 0.05 }, result_count: 59, cost: 0.04, duration_ms: 2800, status: 'complete' },
      { id: 'step-4', op: 'count', tier: 1, args: { by: ['cluster', 'tone'] }, result_count: 15, cost: 0, duration_ms: 4, status: 'complete' }
    ],
    total_cost: 0.06,
    documents_touched: 59
  })
}

function matchQuery(input: string): QueryResult {
  const lower = input.toLowerCase()
  if (lower.includes('schedul') || lower.includes('contentious')) return QUERY_RESPONSES['scheduling']!()
  if (lower.includes('lawyer') || lower.includes('attorney')) return QUERY_RESPONSES['lawyer']!()
  if (lower.includes('hostile') || lower.includes('tone') || lower.includes('angry')) return QUERY_RESPONSES['hostile']!()
  if (lower.includes('responsive') || lower.includes('pattern') || lower.includes('response')) return QUERY_RESPONSES['responsive']!()
  if (lower.includes('topic') || lower.includes('frequent') || lower.includes('common')) return QUERY_RESPONSES['topics']!()

  // Default: return the topics response
  return QUERY_RESPONSES['topics']!()
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ query: string }>(event)

  if (!body.query?.trim()) {
    throw createError({ statusCode: 400, message: 'Query is required' })
  }

  const result = matchQuery(body.query)

  // Simulate execution plan steps arriving one by one
  // We return the full result but the client can simulate the reveal
  const totalDelay = result.execution_plan.reduce((sum, step) => sum + Math.min(step.duration_ms / 4, 500), 0)
  await delay(Math.min(totalDelay, 2000))

  return result
})
