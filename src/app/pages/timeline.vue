<script setup lang="ts">
import type { TimelineResponse, TimelineEvent } from '~/types'

const { state } = useCorpus()

const timelineTitle = ref('Untitled Timeline')
const topicFilter = ref('all')
const toneFilter = ref('all')
const isGenerating = ref(false)
const timelineData = ref<TimelineResponse | null>(null)

const toneOptions = [
  { label: 'All Tones', value: 'all' },
  { label: 'Hostile', value: 'hostile' },
  { label: 'Neutral', value: 'neutral' },
  { label: 'Cooperative', value: 'cooperative' }
]

const topicOptions = computed(() => {
  const topics = timelineData.value?.topics ?? []
  return [
    { label: 'All Topics', value: 'all' },
    ...topics.map(t => ({ label: t, value: t }))
  ]
})

async function generateTimeline() {
  if (isGenerating.value) return

  isGenerating.value = true
  try {
    const response = await $fetch<TimelineResponse>('/api/timeline/generate', {
      method: 'POST',
      body: {
        tone: toneFilter.value,
        topic: topicFilter.value
      }
    })

    timelineData.value = response
    timelineTitle.value = response.title
  } catch {
    // Error handled
  } finally {
    isGenerating.value = false
  }
}

// Re-generate when filters change (if already generated)
watch([toneFilter, topicFilter], () => {
  if (timelineData.value) generateTimeline()
})

const events = computed(() => timelineData.value?.events ?? [])

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
}

function formatShortDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  })
}

function toneDotColor(tone: string) {
  if (tone === 'hostile') return 'bg-red-500'
  if (tone === 'cooperative') return 'bg-green-500'
  return 'bg-neutral-400'
}

function toneColor(tone: string): 'error' | 'neutral' | 'success' {
  if (tone === 'hostile') return 'error'
  if (tone === 'cooperative') return 'success'
  return 'neutral'
}
</script>

<template>
  <UDashboardPanel id="timeline">
    <template #header>
      <UDashboardNavbar title="Timeline">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            label="Generate Timeline"
            icon="i-lucide-sparkles"
            :disabled="!state.loaded.value"
            :loading="isGenerating"
            @click="generateTimeline"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UInput
            v-model="timelineTitle"
            variant="ghost"
            class="font-medium"
            :ui="{ base: 'font-medium text-highlighted' }"
          />
        </template>

        <template #right>
          <USelect
            v-model="topicFilter"
            :items="topicOptions"
            placeholder="Topic"
            class="min-w-28"
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
      <div v-if="isGenerating" class="flex items-center justify-center h-96">
        <div class="text-center space-y-3">
          <UIcon name="i-lucide-loader-circle" class="size-8 text-primary animate-spin mx-auto" />
          <p class="text-sm text-muted">Generating timeline from corpus...</p>
          <p class="text-xs text-muted">Extracting events and ordering chronologically</p>
        </div>
      </div>

      <!-- Timeline Events -->
      <div v-else-if="timelineData && events.length > 0" class="max-w-3xl mx-auto py-6">
        <!-- Timeline Header -->
        <div class="mb-8 text-center">
          <p class="text-sm text-muted">
            {{ events.length }} events from {{ timelineData.total_source_docs }} source messages
          </p>
          <p class="text-xs text-muted mt-1">
            {{ formatDate(timelineData.date_range.start) }} — {{ formatDate(timelineData.date_range.end) }}
          </p>
        </div>

        <!-- Events -->
        <div class="relative">
          <!-- Vertical line -->
          <div class="absolute left-[7.5rem] top-0 bottom-0 w-px bg-default" />

          <div
            v-for="(event, i) in events"
            :key="event.id"
            class="relative flex gap-6 mb-8 last:mb-0"
          >
            <!-- Date column -->
            <div class="w-24 shrink-0 text-right pt-3">
              <p class="text-sm font-medium text-highlighted">{{ formatShortDate(event.date) }}</p>
              <p class="text-xs text-muted">{{ new Date(event.date).getFullYear() }}</p>
            </div>

            <!-- Dot -->
            <div class="relative shrink-0 flex items-start pt-3.5">
              <div
                class="size-3 rounded-full ring-4 ring-[var(--ui-bg)]"
                :class="toneDotColor(event.tone)"
              />
            </div>

            <!-- Event Card -->
            <div class="flex-1 rounded-lg border border-default bg-default p-4 space-y-2">
              <div class="flex items-start justify-between gap-2">
                <h4 class="text-sm font-semibold text-highlighted">{{ event.title }}</h4>
                <UBadge :label="event.tone" variant="subtle" :color="toneColor(event.tone)" size="sm" />
              </div>
              <p class="text-sm text-muted leading-relaxed">{{ event.description }}</p>
              <div class="flex items-center gap-2 flex-wrap">
                <UBadge :label="event.topic" variant="outline" color="neutral" size="sm" />
                <div class="flex items-center gap-1">
                  <NuxtLink
                    v-for="msgNum in event.source_message_numbers"
                    :key="msgNum"
                    to="/messages"
                    class="text-xs font-mono text-primary hover:underline"
                  >
                    Msg #{{ msgNum }}
                  </NuxtLink>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="flex flex-col items-center justify-center h-96 space-y-4">
        <div class="rounded-full bg-default p-6">
          <UIcon name="i-lucide-calendar-clock" class="size-12 text-muted" />
        </div>
        <div class="text-center space-y-2">
          <h3 class="text-lg font-medium text-highlighted">No timeline generated</h3>
          <p class="text-sm text-muted max-w-md">
            {{ state.loaded.value
              ? 'Click "Generate Timeline" to extract chronological events from your corpus with citations.'
              : 'Upload a corpus from the Overview page first, then generate a timeline of events.'
            }}
          </p>
          <div class="flex items-center justify-center gap-2 mt-4">
            <UButton
              v-if="!state.loaded.value"
              label="Go to Overview"
              to="/"
              variant="outline"
              color="neutral"
              icon="i-lucide-arrow-left"
            />
            <UButton
              v-if="state.loaded.value"
              label="Generate Timeline"
              icon="i-lucide-sparkles"
              @click="generateTimeline"
            />
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
