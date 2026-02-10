<script setup lang="ts">
import type { QueryResult, ExecutionStep } from '~/types'

const { state, uploadCorpus } = useCorpus()

// Auto-load corpus if not loaded yet (e.g. direct navigation or page refresh)
if (!state.loaded.value && !state.loading.value) {
  uploadCorpus()
}

const queryInput = ref('')
const isRunning = ref(false)
const result = ref<QueryResult | null>(null)
const visibleSteps = ref<ExecutionStep[]>([])
const showResult = ref(false)
const expandedSteps = ref<Set<string>>(new Set())

function toggleStepArgs(stepId: string) {
  if (expandedSteps.value.has(stepId)) {
    expandedSteps.value.delete(stepId)
  } else {
    expandedSteps.value.add(stepId)
  }
  // trigger reactivity
  expandedSteps.value = new Set(expandedSteps.value)
}

function truncateArgs(args: Record<string, unknown>): string {
  const str = JSON.stringify(args)
  if (str.length <= 60) return str
  return str.slice(0, 57) + '…'
}

type ExampleQueryComplexity = 'simple' | 'medium' | 'complex'

interface ExampleQuery {
  label: string
  complexity: ExampleQueryComplexity
}

const exampleQueries: ExampleQuery[] = [
  // Simple — Tier 1 only (keyword, metadata, counting)
  { label: 'How many messages mention the word "lawyer"?', complexity: 'simple' },
  { label: 'Show all messages from Sarah Mitchell in January 2025', complexity: 'simple' },
  { label: 'Which parent sends more messages?', complexity: 'simple' },

  // Medium — Tier 1 + Tier 3 message-level
  { label: 'Find hostile messages about school pickup', complexity: 'medium' },
  { label: 'What medical appointments or health issues came up for the kids?', complexity: 'medium' },
  { label: 'Are there messages where either parent references the custody agreement?', complexity: 'medium' },

  // Complex — thread-level classification, compound questions
  { label: 'Find conversations where the parents disagreed about an expense over $200', complexity: 'complex' },
  { label: 'Which threads started hostile but ended cooperatively?', complexity: 'complex' },
  { label: 'Are there threads where one parent made a commitment and then followed through on it?', complexity: 'complex' },
  { label: 'Find conversations where David was late or unresponsive and Sarah escalated', complexity: 'complex' }
]

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

    result.value = response

    // Animate execution plan steps appearing one by one
    for (let i = 0; i < response.execution_plan.length; i++) {
      await new Promise(r => setTimeout(r, 400 + Math.random() * 300))
      visibleSteps.value = response.execution_plan.slice(0, i + 1)
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
      <div class="max-w-4xl mx-auto w-full space-y-6">
        <!-- Query Input -->
        <div class="space-y-3">
          <div class="relative">
            <UTextarea
              v-model="queryInput"
              placeholder="Ask a question about your documents..."
              :rows="3"
              autoresize
              class="w-full"
              :disabled="!state.loaded.value"
              @keydown.meta.enter="runQuery"
              @keydown.ctrl.enter="runQuery"
            />
          </div>
          <div class="flex items-center justify-between">
            <p class="text-xs text-muted">
              {{ state.loaded.value
                ? 'The agent will decompose your query into operations, using cheap filters first and LLM calls only when necessary.'
                : 'Upload a corpus from the Overview page to start querying.'
              }}
            </p>
            <UButton
              label="Run Query"
              icon="i-lucide-play"
              :disabled="!queryInput.trim() || !state.loaded.value"
              :loading="isRunning"
              @click="runQuery"
            />
          </div>
        </div>

        <!-- Example Queries -->
        <div v-if="!result" class="space-y-4">
          <div
            v-for="group in [
              { key: 'simple', title: 'Simple', description: 'Keyword search, metadata filters, counting' },
              { key: 'medium', title: 'Medium', description: 'Filters + LLM classification' },
              { key: 'complex', title: 'Complex', description: 'Thread-level analysis, compound questions' }
            ]"
            :key="group.key"
            class="space-y-2"
          >
            <div class="flex items-center gap-2">
              <h3 class="text-xs font-medium text-muted uppercase tracking-wide">
                {{ group.title }}
              </h3>
              <span class="text-xs text-dimmed">— {{ group.description }}</span>
            </div>
            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="example in exampleQueries.filter(q => q.complexity === group.key)"
                :key="example.label"
                :label="example.label"
                variant="outline"
                color="neutral"
                size="sm"
                :disabled="!state.loaded.value"
                @click="queryInput = example.label"
              />
            </div>
          </div>
        </div>

        <USeparator />

        <!-- Execution Plan -->
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-medium text-highlighted">
              Execution Plan
            </h3>
            <div v-if="visibleSteps.length > 0" class="flex items-center gap-3 text-xs text-muted">
              <span>{{ visibleSteps.length }} steps</span>
              <span>·</span>
              <span>{{ visibleSteps.reduce((s, step) => s + (step.result_count ?? 0), 0) }} docs processed</span>
            </div>
          </div>

          <!-- Steps pipeline -->
          <div v-if="visibleSteps.length > 0" class="space-y-0">
            <div
              v-for="(step, i) in visibleSteps"
              :key="step.id"
              class="flex items-start gap-3"
            >
              <!-- Pipeline connector -->
              <div class="flex flex-col items-center shrink-0">
                <div
                  class="size-8 rounded-full border-2 flex items-center justify-center text-xs font-bold"
                  :class="step.tier === 3
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-default bg-default text-muted'"
                >
                  {{ i + 1 }}
                </div>
                <div
                  v-if="i < visibleSteps.length - 1"
                  class="w-0.5 h-8 bg-default"
                />
              </div>

              <!-- Step detail -->
              <div class="flex-1 pb-4">
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

            <!-- Running indicator -->
            <div v-if="isRunning" class="flex items-start gap-3">
              <div class="flex flex-col items-center shrink-0">
                <div class="size-8 rounded-full border-2 border-primary bg-primary/10 flex items-center justify-center">
                  <UIcon name="i-lucide-loader-circle" class="size-4 text-primary animate-spin" />
                </div>
              </div>
              <div class="flex-1 pt-1.5">
                <span class="text-sm text-muted">Processing...</span>
              </div>
            </div>
          </div>

          <!-- Empty state -->
          <div v-else-if="!isRunning" class="flex items-center justify-center h-48 border border-dashed border-default rounded-lg">
            <div class="text-center space-y-2">
              <UIcon name="i-lucide-git-branch" class="size-10 text-muted" />
              <p class="text-sm text-muted">
                Run a query to see the execution plan
              </p>
              <p class="text-xs text-muted">
                Each operation will appear as a step in a pipeline
              </p>
            </div>
          </div>

          <!-- Running empty state -->
          <div v-else class="flex items-center justify-center h-48 border border-dashed border-default rounded-lg">
            <div class="text-center space-y-3">
              <UIcon name="i-lucide-loader-circle" class="size-10 text-primary animate-spin mx-auto" />
              <p class="text-sm text-muted">
                Decomposing query into operations...
              </p>
            </div>
          </div>
        </div>

        <!-- Result -->
        <div class="space-y-3">
          <h3 class="text-sm font-medium text-highlighted">
            Result
          </h3>

          <div v-if="showResult && result" class="space-y-4">
            <!-- Answer prose -->
            <div class="rounded-lg border border-default bg-default p-5">
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
                    <span class="text-xs font-mono font-medium text-highlighted">Msg #{{ cite.message_number }}</span>
                  </div>
                  <p class="text-xs text-muted line-clamp-2">
                    {{ cite.preview }}
                  </p>
                </button>
              </div>
            </div>

            <!-- Summary stats -->
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

          <!-- Empty state -->
          <div v-else-if="!isRunning" class="flex items-center justify-center h-32 border border-dashed border-default rounded-lg">
            <div class="text-center space-y-2">
              <UIcon name="i-lucide-message-circle" class="size-10 text-muted" />
              <p class="text-sm text-muted">
                Results with inline citations will appear here
              </p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
