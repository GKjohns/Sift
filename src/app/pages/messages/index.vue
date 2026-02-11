<script setup lang="ts">
import type { ThreadSummary, ThreadsResponse } from '~/types'

const { state } = useCorpus()

const search = ref('')
const toneFilter = ref('all')

const toneOptions = [
  { label: 'All Tones', value: 'all' },
  { label: 'Hostile', value: 'hostile' },
  { label: 'Neutral', value: 'neutral' },
  { label: 'Cooperative', value: 'cooperative' }
]

// Fetch threads
const { data: threadsData, status: threadsStatus, refresh } = useFetch<ThreadsResponse>('/api/messages', {
  query: computed(() => ({
    search: search.value,
    tone: toneFilter.value
  })),
  watch: false,
  immediate: false
})

// Debounced search
const debouncedRefresh = useDebounceFn(() => refresh(), 300)
watch([search, toneFilter], () => {
  if (state.loaded.value) debouncedRefresh()
})

// Fetch when corpus loads
watch(() => state.loaded.value, (loaded) => {
  if (loaded) refresh()
}, { immediate: true })

const threads = computed(() => threadsData.value?.threads ?? [])
const totalCount = computed(() => threadsData.value?.total ?? 0)

function formatDate(ts: string) {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  })
}

function formatDateRange(thread: ThreadSummary) {
  const start = formatDate(thread.date_range.start)
  const end = formatDate(thread.date_range.end)
  if (start === end) return start
  return `${start} – ${end}`
}

function threadToneColor(thread: ThreadSummary): 'error' | 'success' | 'warning' | 'neutral' {
  const { hostile, cooperative, neutral } = thread.tone_summary
  const total = hostile + cooperative + neutral
  if (hostile / total > 0.5) return 'error'
  if (cooperative / total > 0.5) return 'success'
  if (hostile > 0 && cooperative > 0) return 'warning'
  return 'neutral'
}

function threadToneLabel(thread: ThreadSummary): string {
  const { hostile, cooperative, neutral } = thread.tone_summary
  const parts: string[] = []
  if (hostile > 0) parts.push(`${hostile} hostile`)
  if (neutral > 0) parts.push(`${neutral} neutral`)
  if (cooperative > 0) parts.push(`${cooperative} cooperative`)
  return parts.join(', ')
}

function senderInitial(name: string) {
  return name.split(' ').map(n => n[0]).join('')
}
</script>

<template>
  <UDashboardPanel id="messages">
    <template #header>
      <UDashboardNavbar title="Messages">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #trailing>
          <UBadge
            v-if="state.loaded.value"
            :label="`${totalCount} threads`"
            variant="subtle"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Search threads..."
            class="max-w-xs"
            :disabled="!state.loaded.value"
          />

          <USelect
            v-model="toneFilter"
            :items="toneOptions"
            placeholder="Tone"
            class="min-w-28"
            :disabled="!state.loaded.value"
          />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <!-- Loading -->
      <div v-if="threadsStatus === 'pending' && state.loaded.value" class="flex items-center justify-center h-96">
        <div class="text-center space-y-3">
          <UIcon name="i-lucide-loader-circle" class="size-8 text-primary animate-spin mx-auto" />
          <p class="text-sm text-muted">Loading threads...</p>
        </div>
      </div>

      <!-- Thread List -->
      <div v-else-if="state.loaded.value && threads.length > 0" class="divide-y divide-default">
        <NuxtLink
          v-for="thread in threads"
          :key="thread.thread_id"
          :to="`/messages/${thread.thread_id}`"
          class="block p-4 hover:bg-elevated/50 transition-colors group"
        >
          <div class="flex items-start gap-3">
            <!-- Sender Avatars Stack -->
            <div class="flex -space-x-2 shrink-0 pt-0.5">
              <div
                v-for="sender in thread.senders.slice(0, 2)"
                :key="sender"
                class="size-8 rounded-full flex items-center justify-center text-xs font-semibold ring-2 ring-default"
                :class="sender.includes('Sarah')
                  ? 'bg-primary/10 text-primary'
                  : 'bg-accented text-toned'"
              >
                {{ senderInitial(sender) }}
              </div>
            </div>

            <!-- Thread Content -->
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 mb-1">
                <h3 class="text-sm font-medium text-highlighted truncate">
                  {{ thread.subject }}
                </h3>
                <UBadge
                  :label="`${thread.message_count}`"
                  variant="subtle"
                  color="neutral"
                  size="xs"
                />
                <span class="text-xs text-muted ml-auto shrink-0">
                  {{ formatDateRange(thread) }}
                </span>
              </div>

              <!-- Tone dots -->
              <div class="flex items-center gap-2 mb-1.5">
                <div class="flex items-center gap-1">
                  <div
                    v-for="n in thread.tone_summary.hostile"
                    :key="`h-${n}`"
                    class="size-1.5 rounded-full bg-error/80"
                  />
                  <div
                    v-for="n in thread.tone_summary.neutral"
                    :key="`n-${n}`"
                    class="size-1.5 rounded-full bg-accented"
                  />
                  <div
                    v-for="n in thread.tone_summary.cooperative"
                    :key="`c-${n}`"
                    class="size-1.5 rounded-full bg-primary"
                  />
                </div>
                <span class="text-xs text-muted">{{ threadToneLabel(thread) }}</span>
              </div>

              <!-- Last message preview -->
              <p class="text-sm text-muted line-clamp-1">
                <span class="font-medium text-highlighted/70">{{ thread.last_message_sender.split(' ')[0] }}:</span>
                {{ thread.last_message_preview }}
              </p>
            </div>

            <!-- Arrow -->
            <UIcon
              name="i-lucide-chevron-right"
              class="size-4 text-muted shrink-0 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </div>
        </NuxtLink>
      </div>

      <!-- No results -->
      <div v-else-if="state.loaded.value && threads.length === 0" class="flex flex-col items-center justify-center h-96 space-y-4">
        <div class="rounded-full bg-default p-6">
          <UIcon name="i-lucide-search-x" class="size-12 text-muted" />
        </div>
        <div class="text-center space-y-2">
          <h3 class="text-lg font-medium text-highlighted">No threads match your filters</h3>
          <p class="text-sm text-muted max-w-md">Try adjusting your search terms or tone filter.</p>
          <UButton
            label="Clear Filters"
            variant="outline"
            color="neutral"
            class="mt-4"
            icon="i-lucide-x"
            @click="search = ''; toneFilter = 'all'"
          />
        </div>
      </div>

      <!-- Empty State (no corpus) -->
      <div v-else class="flex flex-col items-center justify-center h-96 space-y-4">
        <div class="rounded-full bg-default p-6">
          <UIcon name="i-lucide-message-square-text" class="size-12 text-muted" />
        </div>
        <div class="text-center space-y-2">
          <h3 class="text-lg font-medium text-highlighted">No messages loaded</h3>
          <p class="text-sm text-muted max-w-md">
            Upload a corpus from the Overview page to browse message threads.
          </p>
          <UButton
            label="Go to Overview"
            to="/"
            variant="outline"
            color="neutral"
            class="mt-4"
            icon="i-lucide-arrow-left"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
