<script setup lang="ts">
useDashboard()

const { state, uploadCorpus, documentCount, senderNames, dateRange } = useCorpus()

async function handleUpload() {
  await uploadCorpus('ofw_export.pdf')
}

// Format month labels for chart
function formatMonth(month: string) {
  const [y, m] = month.split('-')
  const date = new Date(Number(y), Number(m) - 1)
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}
</script>

<template>
  <UDashboardPanel id="overview">
    <template #header>
      <UDashboardNavbar title="Overview">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UModal v-if="!state.loaded.value" title="Upload Corpus" description="Select an OFW PDF export to parse and analyze.">
            <UButton
              label="Upload Corpus"
              icon="i-lucide-upload"
              size="md"
              :loading="state.loading.value"
            />

            <template #content>
              <div class="p-6 space-y-4">
                <div
                  class="border-2 border-dashed border-default rounded-lg p-8 text-center space-y-3 hover:border-primary/50 transition-colors cursor-pointer"
                  @click="handleUpload"
                >
                  <UIcon name="i-lucide-upload-cloud" class="size-12 text-muted mx-auto" />
                  <div>
                    <p class="text-sm font-medium text-highlighted">Click to upload or drag and drop</p>
                    <p class="text-xs text-muted">PDF files only (OFW export format)</p>
                  </div>
                </div>

                <div class="flex items-center gap-2 text-xs text-muted bg-elevated rounded-lg p-3">
                  <UIcon name="i-lucide-info" class="size-4 shrink-0" />
                  <p>For this demo, clicking upload will load a sample OFW corpus with 59 messages between two co-parents.</p>
                </div>

                <div class="flex justify-end gap-2">
                  <UButton label="Load Sample Data" icon="i-lucide-database" @click="handleUpload" />
                </div>
              </div>
            </template>
          </UModal>
          <UBadge v-else label="Corpus Loaded" variant="subtle" color="success" icon="i-lucide-check" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- Stat Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="rounded-lg border border-default bg-default p-4 space-y-2">
          <div class="flex items-center gap-2 text-muted">
            <UIcon name="i-lucide-file-text" class="size-4" />
            <span class="text-sm font-medium">Total Documents</span>
          </div>
          <p class="text-2xl font-semibold text-highlighted">
            {{ state.loaded.value ? documentCount : '—' }}
          </p>
          <p class="text-xs text-muted">
            {{ state.loaded.value ? 'OFW messages parsed' : 'Upload a corpus to begin' }}
          </p>
        </div>

        <div class="rounded-lg border border-default bg-default p-4 space-y-2">
          <div class="flex items-center gap-2 text-muted">
            <UIcon name="i-lucide-users" class="size-4" />
            <span class="text-sm font-medium">Senders</span>
          </div>
          <p class="text-2xl font-semibold text-highlighted">
            {{ state.loaded.value ? state.stats.value?.senders.length : '—' }}
          </p>
          <p v-if="state.loaded.value" class="text-xs text-muted">
            {{ senderNames.join(', ') }}
          </p>
          <p v-else class="text-xs text-muted">Unique participants</p>
        </div>

        <div class="rounded-lg border border-default bg-default p-4 space-y-2">
          <div class="flex items-center gap-2 text-muted">
            <UIcon name="i-lucide-calendar-range" class="size-4" />
            <span class="text-sm font-medium">Date Range</span>
          </div>
          <p class="text-2xl font-semibold text-highlighted" :class="{ 'text-base': state.loaded.value }">
            {{ state.loaded.value && dateRange ? `${dateRange.start} – ${dateRange.end}` : '—' }}
          </p>
          <p class="text-xs text-muted">
            {{ state.loaded.value ? 'Earliest to latest message' : 'Earliest to latest' }}
          </p>
        </div>

        <div class="rounded-lg border border-default bg-default p-4 space-y-2">
          <div class="flex items-center gap-2 text-muted">
            <UIcon name="i-lucide-coins" class="size-4" />
            <span class="text-sm font-medium">LLM Spend</span>
          </div>
          <p class="text-2xl font-semibold text-highlighted">
            ${{ state.loaded.value ? state.stats.value?.llm_spend.toFixed(2) : '0.00' }}
          </p>
          <p class="text-xs text-muted">Total API cost</p>
        </div>
      </div>

      <!-- Volume Chart -->
      <div class="rounded-lg border border-default bg-default p-6 space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm font-medium text-highlighted">Message Volume</h3>
            <p class="text-xs text-muted">Messages per month by sender</p>
          </div>
        </div>

        <!-- Chart when loaded -->
        <div v-if="state.loaded.value && state.stats.value" class="space-y-3">
          <div
            v-for="month in [...new Set(state.stats.value.volume_by_month.map(v => v.month))]"
            :key="month"
            class="flex items-center gap-3"
          >
            <span class="text-xs text-muted w-16 shrink-0 text-right font-mono">{{ formatMonth(month) }}</span>
            <div class="flex-1 flex gap-1 items-center h-7">
              <div
                v-for="entry in state.stats.value.volume_by_month.filter(v => v.month === month)"
                :key="entry.sender"
                class="h-full rounded flex items-center justify-center text-xs font-medium text-inverted transition-all"
                :class="entry.sender.includes('Sarah') ? 'bg-primary' : 'bg-primary/60'"
                :style="{ width: `${Math.max(entry.count * 8, 3)}%` }"
              >
                <span v-if="entry.count > 2" class="px-1">{{ entry.count }}</span>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-4 mt-2 text-xs text-muted">
            <div class="flex items-center gap-1.5">
              <div class="size-3 rounded bg-primary" />
              <span>{{ state.stats.value.senders[0]?.name }}</span>
            </div>
            <div class="flex items-center gap-1.5">
              <div class="size-3 rounded bg-primary/60" />
              <span>{{ state.stats.value.senders[1]?.name }}</span>
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div v-else class="flex items-center justify-center h-64 border border-dashed border-default rounded-lg">
          <div class="text-center space-y-2">
            <UIcon name="i-lucide-bar-chart-3" class="size-10 text-muted" />
            <p class="text-sm text-muted">Volume chart will populate after corpus upload</p>
          </div>
        </div>
      </div>

      <!-- Tone Distribution -->
      <div class="rounded-lg border border-default bg-default p-6 space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm font-medium text-highlighted">Tone Distribution</h3>
            <p class="text-xs text-muted">Hostile / Neutral / Cooperative breakdown by sender</p>
          </div>
          <UBadge
            v-if="!state.loaded.value || !state.stats.value?.has_tone_analysis"
            label="Requires Analysis"
            variant="subtle"
            color="warning"
          />
        </div>

        <!-- Tone chart when loaded -->
        <div v-if="state.loaded.value && state.stats.value?.has_tone_analysis" class="space-y-4">
          <div
            v-for="dist in state.stats.value.tone_distribution"
            :key="dist.sender"
            class="space-y-2"
          >
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-highlighted">{{ dist.sender }}</span>
              <span class="text-xs text-muted">{{ dist.hostile + dist.neutral + dist.cooperative }} messages</span>
            </div>
            <div class="flex h-6 rounded-lg overflow-hidden gap-0.5">
              <div
                class="bg-error/80 flex items-center justify-center text-xs text-inverted font-medium transition-all"
                :style="{ width: `${(dist.hostile / (dist.hostile + dist.neutral + dist.cooperative)) * 100}%` }"
              >
                <span v-if="dist.hostile > 2">{{ dist.hostile }}</span>
              </div>
              <div
                class="bg-accented flex items-center justify-center text-xs text-highlighted font-medium transition-all"
                :style="{ width: `${(dist.neutral / (dist.hostile + dist.neutral + dist.cooperative)) * 100}%` }"
              >
                <span v-if="dist.neutral > 2">{{ dist.neutral }}</span>
              </div>
              <div
                class="bg-primary flex items-center justify-center text-xs text-inverted font-medium transition-all"
                :style="{ width: `${(dist.cooperative / (dist.hostile + dist.neutral + dist.cooperative)) * 100}%` }"
              >
                <span v-if="dist.cooperative > 2">{{ dist.cooperative }}</span>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-4 text-xs text-muted">
            <div class="flex items-center gap-1.5">
              <div class="size-3 rounded bg-error/80" />
              <span>Hostile</span>
            </div>
            <div class="flex items-center gap-1.5">
              <div class="size-3 rounded bg-accented" />
              <span>Neutral</span>
            </div>
            <div class="flex items-center gap-1.5">
              <div class="size-3 rounded bg-primary" />
              <span>Cooperative</span>
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div v-else class="flex items-center justify-center h-48 border border-dashed border-default rounded-lg">
          <div class="text-center space-y-2">
            <UIcon name="i-lucide-brain" class="size-10 text-muted" />
            <p class="text-sm text-muted">
              {{ state.loaded.value ? 'Run tone analysis to populate this view' : 'Upload a corpus first' }}
            </p>
            <UButton label="Run Analysis" variant="outline" color="neutral" size="sm" :disabled="!state.loaded.value" />
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

