<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'

// ── Tab setup ──
const tabs: TabsItem[] = [
  { label: 'Plan Generation', icon: 'i-lucide-git-branch', slot: 'plan' },
  { label: 'Tone Labeling', icon: 'i-lucide-smile', slot: 'tone' },
  { label: 'Event Extraction', icon: 'i-lucide-calendar-clock', slot: 'events' }
]

// ── Plan Generation ──
const planQuery = ref('')
const planLoading = ref(false)
const planResult = ref<any>(null)
const planError = ref<string | null>(null)

const planExamples = [
  'Find messages where scheduling was contentious',
  'How many messages mention the word "lawyer"?',
  'Show me all medical-related discussions',
  'What is the trend of hostile messages over time?',
  'Find all expense-related disagreements over $200',
  'Is there a pattern of one parent being less responsive?'
]

async function runPlanGeneration() {
  if (!planQuery.value.trim() || planLoading.value) return

  planLoading.value = true
  planResult.value = null
  planError.value = null

  try {
    const response = await $fetch('/api/dev/generate-plan', {
      method: 'POST',
      body: { query: planQuery.value }
    })
    planResult.value = response
  } catch (e: any) {
    planError.value = e.data?.message || e.message || 'Failed to generate plan'
  } finally {
    planLoading.value = false
  }
}

// ── Tone Labeling ──
const toneMessage = ref('')
const toneSender = ref('')
const toneContext = ref('')
const toneLoading = ref(false)
const toneResult = ref<any>(null)
const toneError = ref<string | null>(null)

const sampleMessages = [
  {
    label: 'Hostile — Schedule refusal',
    sender: 'David Mitchell',
    text: "Sarah, I already made plans for the 25th. I'm taking the kids to the hockey game — I bought tickets a month ago. This isn't acceptable. You can't just rearrange the schedule because it suits you."
  },
  {
    label: 'Cooperative — Dentist update',
    sender: 'David Mitchell',
    text: "Dentist went fine. Cleaning done, the molar looks okay for now — they want to check again in 6 months. No cavities. Emma was great."
  },
  {
    label: 'Neutral — Homework handoff',
    sender: 'David Mitchell',
    text: "I didn't know about the blue folder. She's never mentioned it. I'll check it from now on. But I'd appreciate being told about these systems directly instead of finding out when you're upset."
  },
  {
    label: 'Hostile — Lawyer threat',
    sender: 'Sarah Mitchell',
    text: "It's not about the party. It's about not answering your phone for 90 minutes when you have the kids and they're supposed to be home. That's irresponsible. If it happens again, I will involve my lawyer."
  },
  {
    label: 'Cooperative — July 4th',
    sender: 'Sarah Mitchell',
    text: "That works. The kids love those fireworks. I'll pick them up Friday at 8am and we'll head to the lake."
  }
]

function loadSampleMessage(sample: typeof sampleMessages[0]) {
  toneMessage.value = sample.text
  toneSender.value = sample.sender
}

async function runToneLabeling() {
  if (!toneMessage.value.trim() || toneLoading.value) return

  toneLoading.value = true
  toneResult.value = null
  toneError.value = null

  try {
    const response = await $fetch('/api/dev/label-tone', {
      method: 'POST',
      body: {
        message_text: toneMessage.value,
        sender: toneSender.value || undefined,
        context: toneContext.value || undefined
      }
    })
    toneResult.value = response
  } catch (e: any) {
    toneError.value = e.data?.message || e.message || 'Failed to classify tone'
  } finally {
    toneLoading.value = false
  }
}

// ── Event Extraction ──
const eventsThreadId = ref('')
const eventsTopicFilter = ref('')
const eventsMaxCount = ref(10)
const eventsLoading = ref(false)
const eventsResult = ref<any>(null)
const eventsError = ref<string | null>(null)

const threadOptions = [
  { label: 'All threads', value: '' },
  { label: 'Schedule Change Request (sched-001)', value: 'sched-001' },
  { label: 'Late Pickup (school-001)', value: 'school-001' },
  { label: 'Emma Dentist (med-001)', value: 'med-001' },
  { label: 'Spring Break (sched-002)', value: 'sched-002' },
  { label: 'Late Exchange (exchange-001)', value: 'exchange-001' },
  { label: 'Soccer Registration (activity-001)', value: 'activity-001' },
  { label: 'Teacher Meeting (school-002)', value: 'school-002' },
  { label: 'Expense Reimbursement (expense-001)', value: 'expense-001' },
  { label: 'Summer Camp (summer-001)', value: 'summer-001' },
  { label: 'Homework (school-003)', value: 'school-003' },
  { label: 'Jake ER Visit (med-002)', value: 'med-002' },
  { label: 'Fourth of July (sched-003)', value: 'sched-003' }
]

async function runEventExtraction() {
  if (eventsLoading.value) return

  eventsLoading.value = true
  eventsResult.value = null
  eventsError.value = null

  try {
    const response = await $fetch('/api/dev/extract-events', {
      method: 'POST',
      body: {
        thread_id: eventsThreadId.value || undefined,
        topic_filter: eventsTopicFilter.value || undefined,
        max_events: eventsMaxCount.value
      }
    })
    eventsResult.value = response
  } catch (e: any) {
    eventsError.value = e.data?.message || e.message || 'Failed to extract events'
  } finally {
    eventsLoading.value = false
  }
}

// ── Helpers ──
function tierLabel(tier: number) {
  if (tier === 1) return 'Free'
  if (tier === 2) return 'Cheap'
  return 'LLM'
}

function tierColor(tier: number): 'success' | 'warning' | 'error' {
  if (tier === 1) return 'success'
  if (tier === 2) return 'warning'
  return 'error'
}

function toneColor(tone: string): 'error' | 'neutral' | 'success' {
  if (tone === 'hostile') return 'error'
  if (tone === 'cooperative') return 'success'
  return 'neutral'
}

function significanceColor(sig: string): 'error' | 'warning' | 'info' {
  if (sig === 'high') return 'error'
  if (sig === 'medium') return 'warning'
  return 'info'
}

function formatTokens(usage: any) {
  if (!usage) return ''
  return `${usage.input_tokens} in / ${usage.output_tokens} out (${usage.total_tokens} total)`
}
</script>

<template>
  <UDashboardPanel id="dev">
    <template #header>
      <UDashboardNavbar title="Dev Workbench">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #trailing>
          <UBadge label="Development" variant="subtle" color="warning" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-5xl mx-auto w-full">
        <div class="mb-6 space-y-1">
          <p class="text-sm text-muted">
            Test server-side features with real OpenAI API calls. Each tab is an isolated feature that makes a real API call and shows the raw response.
          </p>
        </div>

        <UTabs :items="tabs" variant="pill" color="neutral">
          <!-- Plan Generation Tab -->
          <template #plan>
            <div class="space-y-5 pt-4">
              <div class="space-y-3">
                <h3 class="text-sm font-medium text-highlighted">Query Input</h3>
                <UTextarea
                  v-model="planQuery"
                  placeholder="Enter a natural language query to decompose into an execution plan..."
                  :rows="2"
                  autoresize
                  class="w-full"
                  @keydown.meta.enter="runPlanGeneration"
                  @keydown.ctrl.enter="runPlanGeneration"
                />
                <div class="flex items-center justify-between">
                  <p class="text-xs text-muted">
                    The LLM will decompose this into a sequence of Sift operations (filter, search, label, etc.)
                  </p>
                  <UButton
                    label="Generate Plan"
                    icon="i-lucide-sparkles"
                    :loading="planLoading"
                    :disabled="!planQuery.trim()"
                    @click="runPlanGeneration"
                  />
                </div>
              </div>

              <!-- Example chips -->
              <div class="space-y-2">
                <p class="text-xs font-medium text-muted uppercase tracking-wide">Examples</p>
                <div class="flex flex-wrap gap-2">
                  <UButton
                    v-for="example in planExamples"
                    :key="example"
                    :label="example"
                    variant="outline"
                    color="neutral"
                    size="xs"
                    @click="planQuery = example"
                  />
                </div>
              </div>

              <USeparator />

              <!-- Error -->
              <div v-if="planError" class="rounded-lg border border-error/30 bg-error/5 p-4">
                <div class="flex items-center gap-2 mb-1">
                  <UIcon name="i-lucide-alert-circle" class="size-4 text-error" />
                  <span class="text-sm font-medium text-error">Error</span>
                </div>
                <p class="text-sm text-muted">{{ planError }}</p>
              </div>

              <!-- Loading -->
              <div v-if="planLoading" class="flex items-center justify-center h-48 border border-dashed border-default rounded-lg">
                <div class="text-center space-y-3">
                  <UIcon name="i-lucide-loader-circle" class="size-10 text-primary animate-spin mx-auto" />
                  <p class="text-sm text-muted">Calling OpenAI to decompose query...</p>
                  <p class="text-xs text-muted">This is a real API call, may take a few seconds</p>
                </div>
              </div>

              <!-- Results -->
              <div v-if="planResult && !planLoading" class="space-y-4">
                <!-- Query interpretation -->
                <div class="rounded-lg border border-default bg-default p-4">
                  <p class="text-xs font-medium text-muted uppercase tracking-wide mb-1">Query Interpretation</p>
                  <p class="text-sm text-highlighted">{{ planResult.plan.query_interpretation }}</p>
                </div>

                <!-- Execution plan steps -->
                <div class="space-y-2">
                  <p class="text-xs font-medium text-muted uppercase tracking-wide">Execution Steps</p>
                  <div v-for="(step, i) in planResult.plan.steps" :key="i" class="flex items-start gap-3">
                    <div class="flex flex-col items-center shrink-0">
                      <div
                        class="size-8 rounded-full border-2 flex items-center justify-center text-xs font-bold"
                        :class="step.tier === 3
                          ? 'border-primary bg-primary/10 text-primary'
                          : step.tier === 2
                            ? 'border-warning bg-warning/10 text-warning'
                            : 'border-default bg-default text-muted'"
                      >
                        {{ Number(i) + 1 }}
                      </div>
                      <div
                        v-if="Number(i) < planResult.plan.steps.length - 1"
                        class="w-0.5 h-8 bg-default"
                      />
                    </div>
                    <div class="flex-1 pb-2">
                      <div class="rounded-lg border bg-default p-3" :class="step.tier === 3 ? 'border-primary/30' : 'border-default'">
                        <div class="flex items-center gap-2">
                          <span class="font-mono text-sm font-medium text-highlighted">{{ step.op }}</span>
                          <UBadge :label="tierLabel(step.tier)" variant="subtle" :color="tierColor(step.tier)" size="sm" />
                          <span v-if="step.estimated_cost > 0" class="text-xs text-muted ml-auto">${{ step.estimated_cost.toFixed(3) }}</span>
                          <span v-else class="text-xs text-muted ml-auto">Free</span>
                        </div>
                        <p class="text-xs text-muted mt-1">{{ step.rationale }}</p>
                        <div class="flex items-center gap-3 mt-1.5">
                          <code class="text-xs bg-elevated px-1.5 py-0.5 rounded font-mono text-muted">{{ JSON.stringify(step.args) }}</code>
                          <span v-if="step.estimated_result_count" class="text-xs text-muted">~{{ step.estimated_result_count }} docs</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Reasoning summary -->
                <div class="rounded-lg border border-default bg-elevated/50 p-4">
                  <p class="text-xs font-medium text-muted uppercase tracking-wide mb-1">Reasoning</p>
                  <p class="text-sm text-muted">{{ planResult.plan.reasoning_summary }}</p>
                </div>

                <!-- Stats footer -->
                <div class="flex items-center gap-4 text-xs text-muted rounded-lg bg-elevated p-3">
                  <div class="flex items-center gap-1.5">
                    <UIcon name="i-lucide-layers" class="size-3.5" />
                    <span>{{ planResult.plan.steps.length }} steps</span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <UIcon name="i-lucide-coins" class="size-3.5" />
                    <span>Est. cost: ${{ planResult.plan.total_estimated_cost.toFixed(3) }}</span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <UIcon name="i-lucide-cpu" class="size-3.5" />
                    <span>{{ planResult.model }}</span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <UIcon name="i-lucide-hash" class="size-3.5" />
                    <span>{{ formatTokens(planResult.usage) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- Tone Labeling Tab -->
          <template #tone>
            <div class="space-y-5 pt-4">
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <!-- Input side -->
                <div class="space-y-3">
                  <h3 class="text-sm font-medium text-highlighted">Message Input</h3>
                  <UFormField label="Sender (optional)">
                    <UInput v-model="toneSender" placeholder="e.g. Sarah Mitchell" class="w-full" />
                  </UFormField>
                  <UFormField label="Message Text">
                    <UTextarea
                      v-model="toneMessage"
                      placeholder="Paste or type a message to classify..."
                      :rows="5"
                      autoresize
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField label="Conversation Context (optional)">
                    <UTextarea
                      v-model="toneContext"
                      placeholder="Provide surrounding messages for better classification..."
                      :rows="2"
                      autoresize
                      class="w-full"
                    />
                  </UFormField>
                  <UButton
                    label="Classify Tone"
                    icon="i-lucide-sparkles"
                    :loading="toneLoading"
                    :disabled="!toneMessage.trim()"
                    @click="runToneLabeling"
                  />
                </div>

                <!-- Sample messages -->
                <div class="space-y-3">
                  <h3 class="text-sm font-medium text-highlighted">Sample Messages</h3>
                  <p class="text-xs text-muted">Click to load a message from the fake corpus</p>
                  <div class="space-y-2">
                    <button
                      v-for="sample in sampleMessages"
                      :key="sample.label"
                      class="w-full text-left rounded-lg border border-default bg-default p-3 hover:bg-elevated transition-colors"
                      @click="loadSampleMessage(sample)"
                    >
                      <div class="flex items-center gap-2 mb-1">
                        <UBadge
                          :label="sample.label.split(' — ')[0]"
                          variant="subtle"
                          size="sm"
                          :color="sample.label.startsWith('Hostile') ? 'error' : sample.label.startsWith('Cooperative') ? 'success' : 'neutral'"
                        />
                        <span class="text-xs text-muted">{{ sample.sender }}</span>
                      </div>
                      <p class="text-xs text-muted line-clamp-2">{{ sample.text }}</p>
                    </button>
                  </div>
                </div>
              </div>

              <USeparator />

              <!-- Error -->
              <div v-if="toneError" class="rounded-lg border border-error/30 bg-error/5 p-4">
                <div class="flex items-center gap-2 mb-1">
                  <UIcon name="i-lucide-alert-circle" class="size-4 text-error" />
                  <span class="text-sm font-medium text-error">Error</span>
                </div>
                <p class="text-sm text-muted">{{ toneError }}</p>
              </div>

              <!-- Loading -->
              <div v-if="toneLoading" class="flex items-center justify-center h-32 border border-dashed border-default rounded-lg">
                <div class="text-center space-y-3">
                  <UIcon name="i-lucide-loader-circle" class="size-8 text-primary animate-spin mx-auto" />
                  <p class="text-sm text-muted">Classifying tone...</p>
                </div>
              </div>

              <!-- Result -->
              <div v-if="toneResult && !toneLoading" class="space-y-4">
                <div class="rounded-lg border border-default bg-default p-5">
                  <div class="flex items-center gap-3 mb-3">
                    <UBadge
                      :label="toneResult.result.tone.charAt(0).toUpperCase() + toneResult.result.tone.slice(1)"
                      variant="subtle"
                      :color="toneColor(toneResult.result.tone)"
                      size="lg"
                    />
                    <div class="flex items-center gap-1.5">
                      <span class="text-sm text-muted">Confidence:</span>
                      <span class="text-sm font-mono font-medium text-highlighted">{{ (toneResult.result.confidence * 100).toFixed(0) }}%</span>
                    </div>
                  </div>

                  <div class="space-y-3">
                    <div>
                      <p class="text-xs font-medium text-muted uppercase tracking-wide mb-1">Rationale</p>
                      <p class="text-sm text-highlighted">{{ toneResult.result.rationale }}</p>
                    </div>

                    <div>
                      <p class="text-xs font-medium text-muted uppercase tracking-wide mb-1">Key Phrases</p>
                      <div class="flex flex-wrap gap-1.5">
                        <UBadge
                          v-for="phrase in toneResult.result.key_phrases"
                          :key="phrase"
                          :label="phrase"
                          variant="outline"
                          color="neutral"
                          size="sm"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Stats footer -->
                <div class="flex items-center gap-4 text-xs text-muted rounded-lg bg-elevated p-3">
                  <div class="flex items-center gap-1.5">
                    <UIcon name="i-lucide-cpu" class="size-3.5" />
                    <span>{{ toneResult.model }}</span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <UIcon name="i-lucide-hash" class="size-3.5" />
                    <span>{{ formatTokens(toneResult.usage) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- Event Extraction Tab -->
          <template #events>
            <div class="space-y-5 pt-4">
              <div class="space-y-3">
                <h3 class="text-sm font-medium text-highlighted">Extraction Parameters</h3>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <UFormField label="Thread">
                    <USelect
                      v-model="eventsThreadId"
                      :items="threadOptions"
                      value-key="value"
                      label-key="label"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField label="Topic Filter (optional)">
                    <UInput v-model="eventsTopicFilter" placeholder="e.g. Medical" class="w-full" />
                  </UFormField>
                  <UFormField label="Max Events">
                    <UInput v-model.number="eventsMaxCount" type="number" :min="1" :max="20" class="w-full" />
                  </UFormField>
                </div>
                <div class="flex items-center justify-between">
                  <p class="text-xs text-muted">
                    Extract timeline events from {{ eventsThreadId ? 'the selected thread' : 'all 59 messages in the corpus' }}.
                    Uses a real LLM call to identify and describe events.
                  </p>
                  <UButton
                    label="Extract Events"
                    icon="i-lucide-sparkles"
                    :loading="eventsLoading"
                    @click="runEventExtraction"
                  />
                </div>
              </div>

              <USeparator />

              <!-- Error -->
              <div v-if="eventsError" class="rounded-lg border border-error/30 bg-error/5 p-4">
                <div class="flex items-center gap-2 mb-1">
                  <UIcon name="i-lucide-alert-circle" class="size-4 text-error" />
                  <span class="text-sm font-medium text-error">Error</span>
                </div>
                <p class="text-sm text-muted">{{ eventsError }}</p>
              </div>

              <!-- Loading -->
              <div v-if="eventsLoading" class="flex items-center justify-center h-48 border border-dashed border-default rounded-lg">
                <div class="text-center space-y-3">
                  <UIcon name="i-lucide-loader-circle" class="size-10 text-primary animate-spin mx-auto" />
                  <p class="text-sm text-muted">Extracting timeline events...</p>
                  <p class="text-xs text-muted">Analyzing {{ eventsThreadId ? 'thread' : '59' }} messages with OpenAI</p>
                </div>
              </div>

              <!-- Results -->
              <div v-if="eventsResult && !eventsLoading" class="space-y-4">
                <!-- Summary -->
                <div class="rounded-lg border border-default bg-default p-4">
                  <p class="text-xs font-medium text-muted uppercase tracking-wide mb-1">Narrative Summary</p>
                  <p class="text-sm text-highlighted">{{ eventsResult.extraction.summary }}</p>
                </div>

                <!-- Events -->
                <div class="space-y-2">
                  <p class="text-xs font-medium text-muted uppercase tracking-wide">
                    {{ eventsResult.extraction.events.length }} Events Extracted
                  </p>

                  <div class="space-y-3">
                    <div
                      v-for="(evt, i) in eventsResult.extraction.events"
                      :key="i"
                      class="rounded-lg border border-default bg-default p-4"
                    >
                      <div class="flex items-start justify-between gap-3 mb-2">
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="font-medium text-sm text-highlighted">{{ evt.title }}</span>
                          <UBadge :label="evt.tone" variant="subtle" :color="toneColor(evt.tone)" size="sm" />
                          <UBadge :label="evt.significance" variant="outline" :color="significanceColor(evt.significance)" size="sm" />
                        </div>
                        <span class="text-xs text-muted shrink-0 font-mono">{{ evt.date }}</span>
                      </div>
                      <p class="text-sm text-muted mb-2">{{ evt.description }}</p>
                      <div class="flex items-center gap-2 flex-wrap">
                        <UBadge :label="evt.topic" variant="outline" color="neutral" size="sm" />
                        <span class="text-xs text-muted">Sources:</span>
                        <UBadge
                          v-for="msgNum in evt.source_message_numbers"
                          :key="msgNum"
                          :label="`Msg #${msgNum}`"
                          variant="subtle"
                          color="neutral"
                          size="sm"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Stats footer -->
                <div class="flex items-center gap-4 text-xs text-muted rounded-lg bg-elevated p-3">
                  <div class="flex items-center gap-1.5">
                    <UIcon name="i-lucide-file-text" class="size-3.5" />
                    <span>{{ eventsResult.messages_analyzed }} messages analyzed</span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <UIcon name="i-lucide-calendar" class="size-3.5" />
                    <span>{{ eventsResult.extraction.events.length }} events found</span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <UIcon name="i-lucide-cpu" class="size-3.5" />
                    <span>{{ eventsResult.model }}</span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <UIcon name="i-lucide-hash" class="size-3.5" />
                    <span>{{ formatTokens(eventsResult.usage) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </UTabs>
      </div>
    </template>
  </UDashboardPanel>
</template>
