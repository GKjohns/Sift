// ── Fake OFW corpus data ──
// Realistic co-parenting message exchange between two parents

import type { SiftDocument, ToneLabel, DocumentLabel, MessageListItem, TimelineEvent, ThreadSummary } from '~/types'

const SENDERS = ['Sarah Mitchell', 'David Mitchell']
const TONES: ToneLabel[] = ['hostile', 'neutral', 'cooperative']

function toneForText(text: string): ToneLabel {
  const lower = text.toLowerCase()
  if (lower.includes('unacceptable') || lower.includes('refuse') || lower.includes('lawyer')
    || lower.includes('violated') || lower.includes('court') || lower.includes('irresponsible')
    || lower.includes('again') && lower.includes('late') || lower.includes('failed')
    || lower.includes('not acceptable') || lower.includes('negligent')) {
    return 'hostile'
  }
  if (lower.includes('thank') || lower.includes('agree') || lower.includes('works for me')
    || lower.includes('happy to') || lower.includes('appreciate') || lower.includes('sounds good')
    || lower.includes('great idea') || lower.includes('absolutely')) {
    return 'cooperative'
  }
  return 'neutral'
}

function confidenceForTone(tone: ToneLabel): number {
  if (tone === 'hostile') return 0.82 + Math.random() * 0.15
  if (tone === 'cooperative') return 0.75 + Math.random() * 0.2
  return 0.6 + Math.random() * 0.25
}

interface RawMessage {
  sender: number // 0 or 1 index into SENDERS
  date: string
  text: string
  subject?: string
  thread_id?: string
}

const RAW_MESSAGES: RawMessage[] = [
  // Thread 1: Scheduling dispute - Jan 2025
  { sender: 0, date: '2025-01-05T09:15:00', subject: 'Weekend Schedule Change Request', thread_id: 'sched-001', text: 'Hi David, I need to swap weekends this month. My sister is visiting Jan 18-19 and I\'d like the kids to see their aunt. Could we switch so I have them that weekend and you take Jan 25-26 instead?' },
  { sender: 1, date: '2025-01-05T14:22:00', subject: 'Re: Weekend Schedule Change Request', thread_id: 'sched-001', text: 'Sarah, I already made plans for the 25th. I\'m taking the kids to the hockey game — I bought tickets a month ago. This isn\'t acceptable. You can\'t just rearrange the schedule because it suits you.' },
  { sender: 0, date: '2025-01-05T15:01:00', subject: 'Re: Weekend Schedule Change Request', thread_id: 'sched-001', text: 'I understand you have plans, but I\'m asking two weeks in advance. My sister lives in another state and rarely visits. The kids haven\'t seen her in over a year. Can we find a compromise? Maybe you could take them to the game on a different day?' },
  { sender: 1, date: '2025-01-05T17:30:00', subject: 'Re: Weekend Schedule Change Request', thread_id: 'sched-001', text: 'The game is on the 25th. There is no "different day." I refuse to keep rearranging my life every time you decide the schedule doesn\'t work for you. The custody agreement is clear.' },
  { sender: 0, date: '2025-01-06T08:45:00', subject: 'Re: Weekend Schedule Change Request', thread_id: 'sched-001', text: 'I\'m not trying to rearrange your life. I asked one time for one swap. If you can\'t do it, just say that without the hostility. I\'ll figure something else out.' },

  // Thread 2: School pickup - Jan 2025
  { sender: 1, date: '2025-01-10T16:05:00', subject: 'Late Pickup Today', thread_id: 'school-001', text: 'I was 10 minutes late to pickup today because of traffic on Route 9. The school called you apparently. I want to be clear: this was a one-time thing due to an accident on the highway.' },
  { sender: 0, date: '2025-01-10T16:30:00', subject: 'Re: Late Pickup Today', thread_id: 'school-001', text: 'David, this is the third time this semester. Emma was the last child waiting. She was upset. I need you to have a backup plan for pickups. This is becoming a pattern.' },
  { sender: 1, date: '2025-01-10T17:15:00', subject: 'Re: Late Pickup Today', thread_id: 'school-001', text: 'It\'s not a "pattern." Twice was weather-related. Today was an accident on the highway. You\'re keeping a tally to use against me and we both know it.' },
  { sender: 0, date: '2025-01-10T18:00:00', subject: 'Re: Late Pickup Today', thread_id: 'school-001', text: 'I\'m not keeping a tally. The school brought it up, not me. All I\'m asking is that you have a backup plan — your mom lives 10 minutes from the school. Can she be the emergency contact for pickups?' },
  { sender: 1, date: '2025-01-11T09:00:00', subject: 'Re: Late Pickup Today', thread_id: 'school-001', text: 'Fine. I\'ll ask my mother. But I\'d appreciate you not characterizing every small issue as a "pattern."' },

  // Thread 3: Medical - Feb 2025
  { sender: 0, date: '2025-02-03T10:20:00', subject: 'Emma Dentist Appointment', thread_id: 'med-001', text: 'Emma has a dentist appointment on Feb 12 at 3pm with Dr. Patel. It falls on your day. Can you take her? If not, I can pick her up from school and bring her back to you after.' },
  { sender: 1, date: '2025-02-03T12:15:00', subject: 'Re: Emma Dentist Appointment', thread_id: 'med-001', text: 'I can take her. Thanks for letting me know. Is this a routine cleaning or is there an issue?' },
  { sender: 0, date: '2025-02-03T12:30:00', subject: 'Re: Emma Dentist Appointment', thread_id: 'med-001', text: 'Routine cleaning plus they want to check on that molar they were watching. I\'ll send you the office info. Thanks for taking her.' },
  { sender: 1, date: '2025-02-12T17:00:00', subject: 'Re: Emma Dentist Appointment', thread_id: 'med-001', text: 'Dentist went fine. Cleaning done, the molar looks okay for now — they want to check again in 6 months. No cavities. Emma was great.' },
  { sender: 0, date: '2025-02-12T17:20:00', subject: 'Re: Emma Dentist Appointment', thread_id: 'med-001', text: 'That\'s great news! Thanks for the update and for taking her. Appreciate it.' },

  // Thread 4: Scheduling conflict - Feb 2025
  { sender: 1, date: '2025-02-20T08:00:00', subject: 'Spring Break Plans', thread_id: 'sched-002', text: 'I\'d like to take the kids to my parents\' place in Florida for spring break (March 22-29). This is my year per the agreement. I\'ll book the flights this week.' },
  { sender: 0, date: '2025-02-20T09:30:00', subject: 'Re: Spring Break Plans', thread_id: 'sched-002', text: 'Actually, the agreement says you have the first half and I have the second half of spring break. It\'s not the full week. Please re-read Section 4.2.' },
  { sender: 1, date: '2025-02-20T10:45:00', subject: 'Re: Spring Break Plans', thread_id: 'sched-002', text: 'I\'ve re-read it. You\'re right — I have March 22-25 and you have March 26-29. That said, the flights would be much cheaper if I could keep them through the 27th and you take them the 28-29. Would that work?' },
  { sender: 0, date: '2025-02-20T11:30:00', subject: 'Re: Spring Break Plans', thread_id: 'sched-002', text: 'I appreciate you re-reading the agreement. I\'d be okay with you having them through the 26th (one extra day) but not the 27th — I have plans that start on the 27th. Does that work?' },
  { sender: 1, date: '2025-02-20T12:00:00', subject: 'Re: Spring Break Plans', thread_id: 'sched-002', text: 'That works for me. I\'ll book flights back on the 26th. Thanks for being flexible on this.' },
  { sender: 0, date: '2025-02-20T12:15:00', subject: 'Re: Spring Break Plans', thread_id: 'sched-002', text: 'Sounds good. Please send me the flight details once you book them.' },

  // Thread 5: Hostile exchange - March 2025
  { sender: 0, date: '2025-03-08T19:30:00', subject: 'Kids Not Returned on Time', thread_id: 'exchange-001', text: 'David, the exchange time is 6pm. It\'s 7:30 and the kids are still not here. I\'ve called you three times. Where are you?' },
  { sender: 1, date: '2025-03-08T19:45:00', subject: 'Re: Kids Not Returned on Time', thread_id: 'exchange-001', text: 'We were at a birthday party that ran late. I\'m on my way now. I didn\'t hear my phone.' },
  { sender: 0, date: '2025-03-08T20:30:00', subject: 'Re: Kids Not Returned on Time', thread_id: 'exchange-001', text: 'You finally dropped them off at 8:15. This is completely unacceptable. The kids have school tomorrow and their bedtime routine is wrecked. You\'ve violated the custody agreement. I\'m documenting this.' },
  { sender: 1, date: '2025-03-08T21:00:00', subject: 'Re: Kids Not Returned on Time', thread_id: 'exchange-001', text: 'A birthday party ran 90 minutes over. The kids had a great time. You documenting an hour delay because kids were at a party is exactly the kind of thing that makes co-parenting impossible.' },
  { sender: 0, date: '2025-03-09T08:00:00', subject: 'Re: Kids Not Returned on Time', thread_id: 'exchange-001', text: 'It\'s not about the party. It\'s about not answering your phone for 90 minutes when you have the kids and they\'re supposed to be home. That\'s irresponsible. If it happens again, I will involve my lawyer.' },

  // Thread 6: Cooperative exchange - March 2025
  { sender: 1, date: '2025-03-15T10:00:00', subject: 'Jake Soccer Registration', thread_id: 'activity-001', text: 'Spring soccer registration closes Friday. Jake wants to play again. The cost is $180. Should we split it 50/50 as usual?' },
  { sender: 0, date: '2025-03-15T10:30:00', subject: 'Re: Jake Soccer Registration', thread_id: 'activity-001', text: 'Absolutely, Jake loves soccer. 50/50 works. Can you handle the registration and I\'ll Venmo you my half?' },
  { sender: 1, date: '2025-03-15T11:00:00', subject: 'Re: Jake Soccer Registration', thread_id: 'activity-001', text: 'Sounds good. I\'ll register him today. Games are Saturdays — we\'ll need to coordinate who takes him based on the custody schedule. I\'ll send the game schedule once I have it.' },
  { sender: 0, date: '2025-03-15T11:15:00', subject: 'Re: Jake Soccer Registration', thread_id: 'activity-001', text: 'Great idea. Whoever has the kids that Saturday takes him. If there are any conflicts we can figure them out. Thanks for handling this.' },

  // Thread 7: School issue - April 2025
  { sender: 0, date: '2025-04-02T14:00:00', subject: 'Teacher Meeting Request', thread_id: 'school-002', text: 'Mrs. Chen wants to meet with us about Emma\'s reading progress. She\'s available April 10 at 3:30 or April 12 at 4:00. Which works for you? She said both parents should attend if possible.' },
  { sender: 1, date: '2025-04-02T15:30:00', subject: 'Re: Teacher Meeting Request', thread_id: 'school-002', text: 'April 10 works. Is there a problem with Emma\'s reading? She seems fine when she reads with me.' },
  { sender: 0, date: '2025-04-02T16:00:00', subject: 'Re: Teacher Meeting Request', thread_id: 'school-002', text: 'She\'s not behind, but Mrs. Chen says she\'s not progressing as fast as expected. She wants to discuss some strategies we can use at both homes. Nothing alarming.' },
  { sender: 1, date: '2025-04-02T16:15:00', subject: 'Re: Teacher Meeting Request', thread_id: 'school-002', text: 'Okay, good. April 10 at 3:30 then. I\'ll be there.' },

  // Thread 8: Expense dispute - April 2025
  { sender: 1, date: '2025-04-15T09:00:00', subject: 'Expense Reimbursement', thread_id: 'expense-001', text: 'I paid $340 for Jake\'s new glasses last week. Per our agreement, medical expenses are split. Please send $170 when you can.' },
  { sender: 0, date: '2025-04-15T10:30:00', subject: 'Re: Expense Reimbursement', thread_id: 'expense-001', text: 'You took him to get glasses without discussing it with me first? Our agreement says non-emergency medical decisions are made jointly. Were his old glasses broken?' },
  { sender: 1, date: '2025-04-15T11:00:00', subject: 'Re: Expense Reimbursement', thread_id: 'expense-001', text: 'His prescription changed at his eye exam. The optometrist said he needed new lenses. His old frames were too small anyway. This isn\'t a "medical decision" — it\'s filling a prescription.' },
  { sender: 0, date: '2025-04-15T11:30:00', subject: 'Re: Expense Reimbursement', thread_id: 'expense-001', text: 'I would have liked to be included. $340 frames for a 9-year-old? I\'ll pay half of a reasonable cost — $200 for kids glasses is standard. I\'ll send you $100.' },
  { sender: 1, date: '2025-04-15T12:00:00', subject: 'Re: Expense Reimbursement', thread_id: 'expense-001', text: 'The frames were $120 and the lenses with his prescription were $220. That\'s not luxury pricing. But fine, send whatever you think is "reasonable" and I\'ll document the difference.' },

  // Thread 9: Summer planning - May 2025
  { sender: 0, date: '2025-05-01T08:00:00', subject: 'Summer Camp', thread_id: 'summer-001', text: 'I\'ve been looking at summer camps for both kids. River Valley Day Camp runs June 16 - August 8, Mon-Fri 9-3. It\'s $2,400 per kid for the full summer. They have spots available but they\'re filling up.' },
  { sender: 1, date: '2025-05-01T09:30:00', subject: 'Re: Summer Camp', thread_id: 'summer-001', text: 'That\'s $4,800 total. I think we should look at more affordable options. The rec center has a program for $800 per kid.' },
  { sender: 0, date: '2025-05-01T10:00:00', subject: 'Re: Summer Camp', thread_id: 'summer-001', text: 'The rec center program is only 4 weeks and ends at noon. Neither of us can do noon pickups on workdays. River Valley includes lunch and goes until 3. The kids went there two years ago and loved it.' },
  { sender: 1, date: '2025-05-01T11:30:00', subject: 'Re: Summer Camp', thread_id: 'summer-001', text: 'I hear you on the schedule. Can we split the difference? River Valley for 6 weeks instead of 8, and I\'ll handle the other two weeks? That saves us $1,200.' },
  { sender: 0, date: '2025-05-01T12:00:00', subject: 'Re: Summer Camp', thread_id: 'summer-001', text: 'That works for me. Which weeks do you want to take? I\'d suggest the last two weeks of July so it aligns with your vacation time.' },
  { sender: 1, date: '2025-05-01T12:30:00', subject: 'Re: Summer Camp', thread_id: 'summer-001', text: 'Works for me. Last two weeks of July I\'ll have them. Let\'s go ahead and register for the 6 weeks. I appreciate you being flexible on the cost.' },

  // Thread 10: Another hostile exchange - May 2025
  { sender: 0, date: '2025-05-10T20:00:00', subject: 'Homework Not Done', thread_id: 'school-003', text: 'Emma came home with zero homework done from the weekend. She has a book report due tomorrow that she says she "didn\'t have time" to work on at your house. This keeps happening.' },
  { sender: 1, date: '2025-05-10T20:30:00', subject: 'Re: Homework Not Done', thread_id: 'school-003', text: 'She told me she didn\'t have homework. I asked her specifically on Saturday morning. Are you saying she lied to me?' },
  { sender: 0, date: '2025-05-10T20:45:00', subject: 'Re: Homework Not Done', thread_id: 'school-003', text: 'I\'m saying she\'s 8 and of course she\'s going to say she doesn\'t have homework if nobody checks. Can you please check her folder? The school sends a weekly homework sheet every Friday. It\'s in the blue folder.' },
  { sender: 1, date: '2025-05-10T21:00:00', subject: 'Re: Homework Not Done', thread_id: 'school-003', text: 'I didn\'t know about the blue folder. She\'s never mentioned it. I\'ll check it from now on. But I\'d appreciate being told about these systems directly instead of finding out when you\'re upset.' },
  { sender: 0, date: '2025-05-10T21:15:00', subject: 'Re: Homework Not Done', thread_id: 'school-003', text: 'Fair point. I should have mentioned it. I\'ll send you a photo of the homework sheet each Friday so we\'re on the same page. Thanks for agreeing to check it.' },

  // Thread 11: Medical emergency - June 2025
  { sender: 1, date: '2025-06-05T14:30:00', subject: 'URGENT: Jake fell at playground', thread_id: 'med-002', text: 'Jake fell off the monkey bars at the park. We\'re at the ER at Memorial Hospital. He\'s conscious and talking but his arm looks bad. They\'re taking x-rays now. I\'ll update you as soon as I know more.' },
  { sender: 0, date: '2025-06-05T14:35:00', subject: 'Re: URGENT: Jake fell at playground', thread_id: 'med-002', text: 'Oh my god. I\'m on my way. Which entrance should I use?' },
  { sender: 1, date: '2025-06-05T14:40:00', subject: 'Re: URGENT: Jake fell at playground', thread_id: 'med-002', text: 'Main entrance, pediatric ER is to the left. He\'s in room 4. He\'s okay — scared but okay. They think it might be a fracture.' },
  { sender: 0, date: '2025-06-05T16:00:00', subject: 'Re: URGENT: Jake fell at playground', thread_id: 'med-002', text: 'I\'m here. Thank you for getting him here so fast and for updating me right away. He\'s being so brave.' },
  { sender: 1, date: '2025-06-05T18:30:00', subject: 'Re: URGENT: Jake fell at playground', thread_id: 'med-002', text: 'Hairline fracture of the radius. Small cast for 4 weeks. Follow-up with Dr. Kim on June 19. They gave us care instructions. I\'ll make copies for both of us. He\'s already asking when he can play soccer again.' },
  { sender: 0, date: '2025-06-05T18:45:00', subject: 'Re: URGENT: Jake fell at playground', thread_id: 'med-002', text: 'Of course he is. Thank you for handling everything today. I really appreciate how you kept me informed the whole time. Let\'s make sure we both have Dr. Kim\'s number and the follow-up details.' },

  // Thread 12: More scheduling - June 2025
  { sender: 0, date: '2025-06-20T08:00:00', subject: 'Fourth of July', thread_id: 'sched-003', text: 'Fourth of July falls on a Friday this year. Per the agreement, I have the kids for July 4th this year (odd years). I\'m planning to take them to the lake house. We\'d leave Thursday evening and come back Saturday.' },
  { sender: 1, date: '2025-06-20T09:00:00', subject: 'Re: Fourth of July', thread_id: 'sched-003', text: 'You\'re right, it\'s your year. I was hoping to take them to the neighborhood fireworks on the 3rd though — they go every year with the Henderson kids. Could I have them Thursday evening and you pick them up Friday morning?' },
  { sender: 0, date: '2025-06-20T09:30:00', subject: 'Re: Fourth of July', thread_id: 'sched-003', text: 'That works. The kids love those fireworks. I\'ll pick them up Friday at 8am and we\'ll head to the lake.' },
]

// Build full document set
export function generateDocuments(): SiftDocument[] {
  return RAW_MESSAGES.map((msg, i) => ({
    id: `doc-${String(i + 1).padStart(3, '0')}`,
    source: 'ofw' as const,
    timestamp: msg.date,
    text: msg.text,
    metadata: {
      sender: SENDERS[msg.sender]!,
      recipient: SENDERS[msg.sender === 0 ? 1 : 0]!,
      thread_id: msg.thread_id,
      subject: msg.subject,
      word_count: msg.text.split(/\s+/).length,
      message_number: i + 1
    }
  }))
}

export function generateLabels(docs: SiftDocument[]): Record<string, DocumentLabel> {
  const labels: Record<string, DocumentLabel> = {}
  for (const doc of docs) {
    const tone = toneForText(doc.text)
    const confidence = Math.round(confidenceForTone(tone) * 100) / 100
    labels[doc.id] = {
      label: tone,
      confidence,
      rationale_spans: [{
        doc_id: doc.id,
        start: 0,
        end: Math.min(80, doc.text.length),
        text: doc.text.substring(0, 80)
      }]
    }
  }
  return labels
}

export function buildMessageList(docs: SiftDocument[], labels: Record<string, DocumentLabel>): MessageListItem[] {
  return docs.map(doc => ({
    id: doc.id,
    sender: doc.metadata.sender,
    recipient: doc.metadata.recipient,
    timestamp: doc.timestamp,
    text: doc.text,
    preview: doc.text.length > 120 ? doc.text.substring(0, 120) + '...' : doc.text,
    tone: labels[doc.id]?.label ?? null,
    confidence: labels[doc.id]?.confidence ?? null,
    word_count: doc.metadata.word_count,
    message_number: doc.metadata.message_number,
    thread_id: doc.metadata.thread_id,
    subject: doc.metadata.subject
  }))
}

export function buildThreadSummaries(docs: SiftDocument[], labels: Record<string, DocumentLabel>): ThreadSummary[] {
  const threads = new Map<string, SiftDocument[]>()

  for (const doc of docs) {
    const tid = doc.metadata.thread_id || doc.id
    if (!threads.has(tid)) threads.set(tid, [])
    threads.get(tid)!.push(doc)
  }

  const summaries: ThreadSummary[] = []

  for (const [threadId, threadDocs] of threads) {
    // Sort messages in thread chronologically
    threadDocs.sort((a, b) => a.timestamp.localeCompare(b.timestamp))

    const senders = [...new Set(threadDocs.map(d => d.metadata.sender))]
    const timestamps = threadDocs.map(d => d.timestamp).sort()
    const lastDoc = threadDocs[threadDocs.length - 1]!
    const firstDoc = threadDocs[0]!

    // Count tones
    const toneSummary = { hostile: 0, neutral: 0, cooperative: 0 }
    for (const doc of threadDocs) {
      const label = labels[doc.id]
      if (label) toneSummary[label.label]++
    }

    summaries.push({
      thread_id: threadId,
      subject: firstDoc.metadata.subject?.replace(/^Re:\s*/i, '') || 'Untitled Thread',
      message_count: threadDocs.length,
      date_range: { start: timestamps[0]!, end: timestamps[timestamps.length - 1]! },
      senders,
      tone_summary: toneSummary,
      last_message_preview: lastDoc.text.length > 120 ? lastDoc.text.substring(0, 120) + '...' : lastDoc.text,
      last_message_sender: lastDoc.metadata.sender,
      last_message_timestamp: lastDoc.timestamp
    })
  }

  // Sort by most recent message first
  summaries.sort((a, b) => b.last_message_timestamp.localeCompare(a.last_message_timestamp))

  return summaries
}

export function buildCorpusStats(docs: SiftDocument[], labels: Record<string, DocumentLabel>) {
  const senderCounts: Record<string, number> = {}
  const monthCounts: Record<string, Record<string, number>> = {}
  const toneBySender: Record<string, { hostile: number; neutral: number; cooperative: number }> = {}

  for (const doc of docs) {
    // Sender counts
    senderCounts[doc.metadata.sender] = (senderCounts[doc.metadata.sender] || 0) + 1

    // Volume by month
    const month = doc.timestamp.substring(0, 7) // YYYY-MM
    if (!monthCounts[month]) monthCounts[month] = {}
    monthCounts[month]![doc.metadata.sender] = (monthCounts[month]![doc.metadata.sender] || 0) + 1

    // Tone by sender
    if (!toneBySender[doc.metadata.sender]) {
      toneBySender[doc.metadata.sender] = { hostile: 0, neutral: 0, cooperative: 0 }
    }
    const label = labels[doc.id]
    if (label) {
      toneBySender[doc.metadata.sender]![label.label]++
    }
  }

  const timestamps = docs.map(d => d.timestamp).sort()

  return {
    total_documents: docs.length,
    senders: Object.entries(senderCounts).map(([name, count]) => ({ name, count })),
    date_range: {
      start: timestamps[0]!,
      end: timestamps[timestamps.length - 1]!
    },
    llm_spend: 0.47, // Fake accumulated spend
    volume_by_month: Object.entries(monthCounts).flatMap(([month, senders]) =>
      Object.entries(senders).map(([sender, count]) => ({ month, sender, count }))
    ).sort((a, b) => a.month.localeCompare(b.month)),
    tone_distribution: Object.entries(toneBySender).map(([sender, tones]) => ({
      sender,
      ...tones
    })),
    has_tone_analysis: true
  }
}

export function generateTimelineEvents(): TimelineEvent[] {
  return [
    {
      id: 'evt-001',
      title: 'Weekend schedule swap denied',
      description: 'Sarah requested a weekend swap for her sister\'s visit. David refused, citing pre-purchased hockey tickets. Exchange became heated with David invoking the custody agreement.',
      date: '2025-01-05',
      tone: 'hostile',
      source_doc_ids: ['doc-001', 'doc-002', 'doc-003', 'doc-004', 'doc-005'],
      source_message_numbers: [1, 2, 3, 4, 5],
      topic: 'Scheduling'
    },
    {
      id: 'evt-002',
      title: 'Third late school pickup',
      description: 'David was 10 minutes late for school pickup, the third time this semester. Sarah raised concern about a pattern. David agreed to add his mother as emergency backup.',
      date: '2025-01-10',
      tone: 'hostile',
      source_doc_ids: ['doc-006', 'doc-007', 'doc-008', 'doc-009', 'doc-010'],
      source_message_numbers: [6, 7, 8, 9, 10],
      topic: 'School'
    },
    {
      id: 'evt-003',
      title: 'Emma\'s dental checkup — all clear',
      description: 'Cooperative exchange about Emma\'s routine dentist visit. David took her on his custody day. Molar being monitored was fine. No cavities.',
      date: '2025-02-12',
      tone: 'cooperative',
      source_doc_ids: ['doc-011', 'doc-012', 'doc-013', 'doc-014', 'doc-015'],
      source_message_numbers: [11, 12, 13, 14, 15],
      topic: 'Medical'
    },
    {
      id: 'evt-004',
      title: 'Spring break compromise reached',
      description: 'David initially tried to claim full spring break week. Sarah corrected him on the agreement terms. Both parents compromised — David got one extra day for cheaper flights.',
      date: '2025-02-20',
      tone: 'cooperative',
      source_doc_ids: ['doc-016', 'doc-017', 'doc-018', 'doc-019', 'doc-020', 'doc-021'],
      source_message_numbers: [16, 17, 18, 19, 20, 21],
      topic: 'Scheduling'
    },
    {
      id: 'evt-005',
      title: 'Late custody exchange — lawyer threatened',
      description: 'David returned children 2+ hours late from a birthday party without answering his phone. Sarah documented the incident and threatened to involve her lawyer.',
      date: '2025-03-08',
      tone: 'hostile',
      source_doc_ids: ['doc-022', 'doc-023', 'doc-024', 'doc-025', 'doc-026'],
      source_message_numbers: [22, 23, 24, 25, 26],
      topic: 'Custody Exchange'
    },
    {
      id: 'evt-006',
      title: 'Jake registered for spring soccer',
      description: 'Parents cooperatively agreed to register Jake for soccer and split the $180 cost 50/50. Agreed to share game schedule and alternate based on custody.',
      date: '2025-03-15',
      tone: 'cooperative',
      source_doc_ids: ['doc-027', 'doc-028', 'doc-029', 'doc-030'],
      source_message_numbers: [27, 28, 29, 30],
      topic: 'Activities'
    },
    {
      id: 'evt-007',
      title: 'Teacher meeting scheduled for Emma',
      description: 'Both parents agreed to attend a meeting with Emma\'s teacher about reading progress. No alarm — just strategies for both households.',
      date: '2025-04-02',
      tone: 'cooperative',
      source_doc_ids: ['doc-031', 'doc-032', 'doc-033', 'doc-034'],
      source_message_numbers: [31, 32, 33, 34],
      topic: 'School'
    },
    {
      id: 'evt-008',
      title: 'Glasses expense dispute',
      description: 'David bought Jake $340 glasses without consulting Sarah. Sarah objected to the cost and unilateral decision, offering $100 instead of $170. David documented the disagreement.',
      date: '2025-04-15',
      tone: 'hostile',
      source_doc_ids: ['doc-035', 'doc-036', 'doc-037', 'doc-038', 'doc-039'],
      source_message_numbers: [35, 36, 37, 38, 39],
      topic: 'Expenses'
    },
    {
      id: 'evt-009',
      title: 'Summer camp compromise',
      description: 'Parents agreed on 6 weeks of River Valley Day Camp instead of 8 to save costs. David will have kids the last two weeks of July during his vacation.',
      date: '2025-05-01',
      tone: 'cooperative',
      source_doc_ids: ['doc-040', 'doc-041', 'doc-042', 'doc-043', 'doc-044', 'doc-045'],
      source_message_numbers: [40, 41, 42, 43, 44, 45],
      topic: 'Activities'
    },
    {
      id: 'evt-010',
      title: 'Homework communication gap resolved',
      description: 'Emma\'s homework wasn\'t completed at David\'s house. Root cause: David didn\'t know about the blue homework folder. Sarah agreed to send photos of the weekly sheet. Both parents took responsibility.',
      date: '2025-05-10',
      tone: 'neutral',
      source_doc_ids: ['doc-046', 'doc-047', 'doc-048', 'doc-049', 'doc-050'],
      source_message_numbers: [46, 47, 48, 49, 50],
      topic: 'School'
    },
    {
      id: 'evt-011',
      title: 'Jake\'s arm fracture — ER visit',
      description: 'Jake fell at the playground and fractured his radius. David took him to the ER and kept Sarah informed throughout. Cooperative and supportive exchange during crisis.',
      date: '2025-06-05',
      tone: 'cooperative',
      source_doc_ids: ['doc-051', 'doc-052', 'doc-053', 'doc-054', 'doc-055', 'doc-056'],
      source_message_numbers: [51, 52, 53, 54, 55, 56],
      topic: 'Medical'
    },
    {
      id: 'evt-012',
      title: 'July 4th plans coordinated',
      description: 'Sarah has July 4th per the odd-year agreement. David asked to keep kids for neighborhood fireworks on the 3rd. Both agreed to the arrangement without conflict.',
      date: '2025-06-20',
      tone: 'cooperative',
      source_doc_ids: ['doc-057', 'doc-058', 'doc-059'],
      source_message_numbers: [57, 58, 59],
      topic: 'Scheduling'
    }
  ]
}

// Fake delay helper
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
