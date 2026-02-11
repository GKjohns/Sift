<script setup lang="ts">
import type { QueryResult, ExecutionStep } from '~/types'
import type { SelectMenuItem } from '@nuxt/ui'

const { state, bootstrapCorpus } = useCorpus()

// Auto-load corpus if not loaded yet (e.g. direct navigation or page refresh)
if (!state.loaded.value && !state.loading.value) {
  bootstrapCorpus()
}

const queryInput = ref('')
const isRunning = ref(false)
const result = ref<QueryResult | null>(null)
const visibleSteps = ref<ExecutionStep[]>([])
const showResult = ref(false)
const expandedSteps = ref<Set<string>>(new Set())

// Track whether we have an active query session (running or has results)
const hasActiveSession = computed(() => isRunning.value || result.value !== null)

// Detect platform for keyboard shortcut display (client-side only)
const isMac = computed(() => {
  if (typeof window === 'undefined') return false
  return navigator?.platform?.toLowerCase().includes('mac') ?? false
})

type SynthAnswerBlob = {
  answer: string
  citations?: { doc_id: string; preview: string; thread_id?: string }[]
}

function stripMarkdownCodeFences(text: string): string {
  const trimmed = text.trim()
  if (!trimmed.startsWith('```')) return trimmed
  const lines = trimmed.split('\n')
  if (lines.length < 2) return trimmed
  if (lines[0]?.trim().startsWith('```')) lines.shift()
  if (lines.at(-1)?.trim() === '```') lines.pop()
  return lines.join('\n').trim()
}

function tryParseSynthAnswerBlob(answerText: string): SynthAnswerBlob | null {
  const cleaned = stripMarkdownCodeFences(answerText)
  if (!cleaned.startsWith('{') || !cleaned.includes('"answer"')) return null

  try {
    const parsed = JSON.parse(cleaned) as any
    if (parsed && typeof parsed.answer === 'string') return parsed as SynthAnswerBlob
    return null
  } catch {
    return null
  }
}

function normalizeQueryResult(r: QueryResult): QueryResult {
  const blob = tryParseSynthAnswerBlob(r.answer)
  if (!blob) return r

  const citationsFromBlob = Array.isArray(blob.citations)
    ? blob.citations
        .map(c => ({
          doc_id: String(c?.doc_id ?? ''),
          preview: String(c?.preview ?? ''),
          message_number: undefined
        }))
        .filter(c => Boolean(c.doc_id))
    : r.citations

  return {
    ...r,
    answer: blob.answer,
    citations: citationsFromBlob
  }
}

function toggleStepArgs(stepId: string) {
  if (expandedSteps.value.has(stepId)) {
    expandedSteps.value.delete(stepId)
  } else {
    expandedSteps.value.add(stepId)
  }
  expandedSteps.value = new Set(expandedSteps.value)
}

function truncateArgs(args: Record<string, unknown>): string {
  const str = JSON.stringify(args)
  if (str.length <= 60) return str
  return str.slice(0, 57) + '…'
}

// Example queries as SelectMenu items grouped by complexity
const exampleQueryItems: (SelectMenuItem | string)[][] = [
  [
    { type: 'label' as const, label: 'Simple — keyword search, metadata, counting' },
    { label: 'How many messages mention "attorney" or "lawyer"?', value: 'How many messages mention "attorney" or "lawyer"?', icon: 'i-lucide-search' },
    { label: 'Which parent sends more messages overall?', value: 'Which parent sends more messages overall?', icon: 'i-lucide-search' },
    { label: 'Show all messages about the parenting schedule', value: 'Show all messages about the parenting schedule', icon: 'i-lucide-search' },
  ],
  [
    { type: 'label' as const, label: 'Medium — filters + LLM classification' },
    { label: 'Find hostile messages related to pickup or dropoff logistics', value: 'Find hostile messages related to pickup or dropoff logistics', icon: 'i-lucide-brain' },
    { label: 'Are there messages where a parent threatens to involve counsel or the court?', value: 'Are there messages where a parent threatens to involve counsel or the court?', icon: 'i-lucide-brain' },
    { label: 'What safety concerns were raised about the child\'s living situation?', value: 'What safety concerns were raised about the child\'s living situation?', icon: 'i-lucide-brain' },
  ],
  [
    { type: 'label' as const, label: 'Complex — thread-level analysis, compound questions' },
    { label: 'Which threads started contentious but ended with an agreement?', value: 'Which threads started contentious but ended with an agreement?', icon: 'i-lucide-git-merge' },
    { label: 'Find conversations where one parent proposed a schedule change and the other resisted', value: 'Find conversations where one parent proposed a schedule change and the other resisted', icon: 'i-lucide-git-merge' },
    { label: 'Are there threads where one parent made a commitment and followed through?', value: 'Are there threads where one parent made a commitment and followed through?', icon: 'i-lucide-git-merge' },
    { label: 'Summarize all disputes about who is responsible for the child\'s belongings', value: 'Summarize all disputes about who is responsible for the child\'s belongings', icon: 'i-lucide-git-merge' },
  ]
]

function onExampleSelect(item: unknown) {
  if (typeof item === 'string') {
    queryInput.value = item
  } else if (item && typeof item === 'object' && 'value' in item && typeof (item as { value: string }).value === 'string') {
    queryInput.value = (item as { value: string }).value
  } else if (item && typeof item === 'object' && 'label' in item && typeof (item as { label: string }).label === 'string') {
    queryInput.value = (item as { label: string }).label
  }
}

function clearResults() {
  result.value = null
  visibleSteps.value = []
  showResult.value = false
  expandedSteps.value = new Set()
}

async function runQuery() {
  if (!queryInput.value.trim() || isRunning.value) return

  isRunning.value = true
  result.value = null
  visibleSteps.value = []
  showResult.value = false

  try {
    const response = await $fetch<QueryResult>('/api/query/run', {
      method: 'POST',
      body: { query: queryInput.value }
    })

    const normalized = normalizeQueryResult(response)
    result.value = normalized

    // Animate execution plan steps appearing one by one
    for (let i = 0; i < normalized.execution_plan.length; i++) {
      await new Promise(r => setTimeout(r, 400 + Math.random() * 300))
      visibleSteps.value = normalized.execution_plan.slice(0, i + 1)
    }

    // Show result after all steps
    await new Promise(r => setTimeout(r, 500))
    showResult.value = true
  } catch {
    // Error toast handled by $fetch
  } finally {
    isRunning.value = false
  }
}

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

function formatCost(cost: number) {
  if (cost === 0) return 'Free'
  return `$${cost.toFixed(3)}`
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function navigateToMessage(docId: string) {
  navigateTo(`/messages?msg=${docId}`)
}
</script>

<template>
  <UDashboardPanel id="query">
    <template #header>
      <UDashboardNavbar title="Query">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-4xl mx-auto w-full flex flex-col gap-6 h-full">

        <!-- Query Input Bar -->
        <div class="shrink-0 max-w-2xl mx-auto w-full space-y-3">
          <UTextarea
            v-model="queryInput"
            placeholder="Ask a question about your documents..."
            :rows="hasActiveSession ? 1 : 3"
            autoresize
            class="w-full transition-all duration-200"
            :disabled="!state.loaded.value"
            @keydown.meta.enter="runQuery"
            @keydown.ctrl.enter="runQuery"
          />
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <USelectMenu
                icon="i-lucide-lightbulb"
                placeholder="Examples"
                :items="exampleQueryItems"
                value-key="value"
                :search-input="false"
                :disabled="!state.loaded.value"
                size="md"
                color="neutral"
                variant="outline"
                class="w-52"
                :ui="{ content: 'w-80', itemLabel: 'whitespace-normal' }"
                @update:model-value="onExampleSelect"
              />
              <ClientOnly>
                <span v-if="!hasActiveSession" class="text-xs text-dimmed">
                  <kbd class="px-1.5 py-0.5 rounded border border-default bg-elevated text-[10px] font-mono">{{ isMac ? '⌘' : 'Ctrl' }}+Enter</kbd>
                </span>
              </ClientOnly>
            </div>
            <div class="flex items-center gap-2">
              <button
                v-if="hasActiveSession && state.loaded.value"
                class="text-xs text-muted hover:text-highlighted cursor-pointer transition-colors"
                @click="clearResults"
              >Clear</button>
              <UButton
                label="Run"
                icon="i-lucide-play"
                :disabled="!queryInput.trim() || !state.loaded.value"
                :loading="isRunning"
                @click="runQuery"
              />
            </div>
          </div>
        </div>

        <!-- ==================== Active Session View ==================== -->
        <template v-if="hasActiveSession">
          <!-- Result (shown first when available - front and center) -->
          <div v-if="showResult && result" class="space-y-4">
            <!-- Answer prose - prominent -->
            <div class="rounded-xl border border-primary/20 bg-default p-6 shadow-sm">
              <div class="flex items-center gap-2 mb-4">
                <UIcon name="i-lucide-sparkles" class="size-4 text-primary" />
                <h3 class="text-sm font-semibold text-highlighted">Answer</h3>
              </div>
              <div class="prose prose-sm dark:prose-invert max-w-none text-highlighted leading-relaxed">
                <MDC :value="result.answer" />
              </div>
            </div>

            <!-- Citations -->
            <div v-if="result.citations.length > 0" class="space-y-2">
              <p class="text-xs font-medium text-muted uppercase tracking-wide">
                Sources
              </p>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="cite in result.citations"
                  :key="cite.doc_id"
                  class="rounded-lg border border-default bg-default p-2.5 text-left hover:bg-elevated transition-colors max-w-xs"
                  @click="navigateToMessage(cite.doc_id)"
                >
                  <div class="flex items-center gap-1.5 mb-1">
                    <UIcon name="i-lucide-message-square-text" class="size-3 text-muted" />
                    <span class="text-xs font-mono font-medium text-highlighted">
                      {{ cite.message_number ? `Msg #${cite.message_number}` : cite.doc_id }}
                    </span>
                  </div>
                  <p class="text-xs text-muted line-clamp-2">
                    {{ cite.preview }}
                  </p>
                </button>
              </div>
            </div>

            <!-- Summary stats bar -->
            <div class="flex items-center gap-4 text-xs text-muted rounded-lg bg-elevated p-3">
              <div class="flex items-center gap-1.5">
                <UIcon name="i-lucide-layers" class="size-3.5" />
                <span>{{ result.execution_plan.length }} operations</span>
              </div>
              <div class="flex items-center gap-1.5">
                <UIcon name="i-lucide-file-text" class="size-3.5" />
                <span>{{ result.documents_touched }} documents</span>
              </div>
              <div class="flex items-center gap-1.5">
                <UIcon name="i-lucide-coins" class="size-3.5" />
                <span>{{ result.total_cost === 0 ? 'Free' : `$${result.total_cost.toFixed(3)}` }}</span>
              </div>
            </div>
          </div>

          <!-- Running state (before result is ready) -->
          <div v-else-if="isRunning && visibleSteps.length === 0" class="flex-1 flex items-center justify-center">
            <div class="text-center space-y-3">
              <UIcon name="i-lucide-loader-circle" class="size-10 text-primary animate-spin mx-auto" />
              <p class="text-sm text-muted">
                Decomposing query into operations...
              </p>
            </div>
          </div>

          <!-- Execution Plan (collapsible section, shown below result or during execution) -->
          <div v-if="visibleSteps.length > 0" class="space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-medium text-highlighted flex items-center gap-2">
                <UIcon name="i-lucide-git-branch" class="size-4" />
                Execution Plan
              </h3>
              <div class="flex items-center gap-3 text-xs text-muted">
                <span>{{ visibleSteps.length }} steps</span>
                <span>·</span>
                <span>{{ visibleSteps.reduce((s, step) => s + (step.result_count ?? 0), 0) }} docs processed</span>
              </div>
            </div>

            <!-- Steps pipeline -->
            <div class="space-y-0">
              <div
                v-for="(step, i) in visibleSteps"
                :key="step.id"
                class="flex items-start gap-3"
              >
                <!-- Pipeline connector -->
                <div class="flex flex-col items-center shrink-0">
                  <div
                    class="size-7 rounded-full border-2 flex items-center justify-center text-xs font-bold"
                    :class="step.tier === 3
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-default bg-default text-muted'"
                  >
                    {{ i + 1 }}
                  </div>
                  <div
                    v-if="i < visibleSteps.length - 1 || isRunning"
                    class="w-0.5 h-6 bg-default"
                  />
                </div>

                <!-- Step detail -->
                <div class="flex-1 pb-2">
                  <div class="rounded-lg border bg-default p-3" :class="step.tier === 3 ? 'border-primary/30' : 'border-default'">
                    <div class="flex items-center gap-2">
                      <span class="font-mono text-sm font-medium text-highlighted">{{ step.op }}</span>
                      <UBadge :label="tierLabel(step.tier)" variant="subtle" :color="tierColor(step.tier)" size="sm" />
                      <span class="text-xs text-muted ml-auto">{{ formatDuration(step.duration_ms) }}</span>
                    </div>
                    <div class="flex items-center gap-3 mt-1 text-xs text-muted">
                      <span v-if="step.result_count !== null">{{ step.result_count }} results</span>
                      <span>{{ formatCost(step.cost) }}</span>
                    </div>

                    <!-- Expandable args -->
                    <button
                      class="mt-2 flex items-center gap-1.5 text-xs text-muted hover:text-highlighted transition-colors group cursor-pointer"
                      @click="toggleStepArgs(step.id)"
                    >
                      <UIcon
                        name="i-lucide-chevron-right"
                        class="size-3.5 transition-transform duration-200"
                        :class="expandedSteps.has(step.id) ? 'rotate-90' : ''"
                      />
                      <span class="font-mono">args</span>
                      <code
                        v-if="!expandedSteps.has(step.id)"
                        class="text-xs text-dimmed bg-elevated px-1.5 py-0.5 rounded font-mono truncate max-w-sm"
                      >{{ truncateArgs(step.args) }}</code>
                    </button>

                    <Transition
                      enter-active-class="transition-all duration-200 ease-out"
                      leave-active-class="transition-all duration-150 ease-in"
                      enter-from-class="opacity-0 max-h-0"
                      enter-to-class="opacity-100 max-h-96"
                      leave-from-class="opacity-100 max-h-96"
                      leave-to-class="opacity-0 max-h-0"
                    >
                      <pre
                        v-if="expandedSteps.has(step.id)"
                        class="mt-2 text-xs font-mono bg-elevated rounded-md p-3 overflow-x-auto text-highlighted whitespace-pre-wrap break-words"
                      >{{ JSON.stringify(step.args, null, 2) }}</pre>
                    </Transition>
                  </div>
                </div>
              </div>

              <!-- Running indicator at end of pipeline -->
              <div v-if="isRunning" class="flex items-start gap-3">
                <div class="flex flex-col items-center shrink-0">
                  <div class="size-7 rounded-full border-2 border-primary bg-primary/10 flex items-center justify-center">
                    <UIcon name="i-lucide-loader-circle" class="size-3.5 text-primary animate-spin" />
                  </div>
                </div>
                <div class="flex-1 pt-1">
                  <span class="text-sm text-muted">Processing...</span>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- ==================== Empty State (no active session) ==================== -->
        <div v-else class="flex-1 flex items-center justify-center">
          <div class="text-center space-y-4 max-w-sm">
            <div class="mx-auto size-16 rounded-2xl bg-elevated flex items-center justify-center">
              <UIcon name="i-lucide-search" class="size-8 text-muted" />
            </div>
            <div class="space-y-1">
              <p class="text-sm font-medium text-highlighted">
                Ask anything about your documents
              </p>
              <p class="text-xs text-muted leading-relaxed">
                The engine decomposes your query into a pipeline of operations, using cheap filters first and LLM calls only when necessary. Try an example from the dropdown above.
              </p>
            </div>
          </div>
        </div>

      </div>
    </template>
  </UDashboardPanel>
</template>
