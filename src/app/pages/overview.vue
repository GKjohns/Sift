<script setup lang="ts">
useDashboard()

const { state, uploadCorpus, documentCount, senderNames, dateRange } = useCorpus()

const fileInputRef = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const dragOver = ref(false)

// OFW export helper (UI recreation)
const ofwExport = reactive({
  messages: 'all_in_folder',
  sort: 'oldest_to_newest',
  attachments: 'include_all_in_folder',
  includeOfficialHeader: false,
  includeReplies: true,
  includeProfessionalPrivate: false,
  newPagePerMessage: true,
})

const ofwExportMessagesItems = [
  { label: 'All In Folder', value: 'all_in_folder' },
]
const ofwExportSortItems = [
  { label: 'Oldest to newest', value: 'oldest_to_newest' },
  { label: 'Newest to oldest', value: 'newest_to_oldest' },
]
const ofwExportAttachmentsItems = [
  { label: 'Include all in folder', value: 'include_all_in_folder' },
  { label: "Don't include attachments", value: 'exclude_all' },
]

function triggerFileInput() {
  fileInputRef.value?.click()
}

function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    selectedFile.value = file
    handleUpload(file)
  }
}

function onDrop(event: DragEvent) {
  dragOver.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file && file.name.toLowerCase().endsWith('.pdf')) {
    selectedFile.value = file
    handleUpload(file)
  }
}

async function handleUpload(file: File) {
  await uploadCorpus(file)
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
                <!-- OFW Export instructions -->
                <div class="rounded-lg border border-default bg-default p-4">
                  <div class="flex items-start justify-between gap-3">
                    <div class="space-y-1">
                      <h3 class="text-sm font-semibold text-highlighted">Export from OurFamilyWizard</h3>
                      <p class="text-xs text-muted">
                        Export a <span class="font-medium">Messages Report</span> PDF from OFW using these settings, then upload it below.
                      </p>
                    </div>
                    <UBadge label="PDF" variant="subtle" color="neutral" />
                  </div>

                  <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <!-- Left: settings form -->
                    <div class="space-y-3">
                      <div class="space-y-1">
                        <p class="text-xs font-medium text-muted uppercase tracking-wide">Messages</p>
                        <USelect
                          v-model="ofwExport.messages"
                          :items="ofwExportMessagesItems"
                          value-key="value"
                          label-key="label"
                          color="neutral"
                        />
                      </div>

                      <div class="space-y-1">
                        <p class="text-xs font-medium text-muted uppercase tracking-wide">Sort messages by</p>
                        <USelect
                          v-model="ofwExport.sort"
                          :items="ofwExportSortItems"
                          value-key="value"
                          label-key="label"
                          color="neutral"
                        />
                      </div>

                      <div class="space-y-1">
                        <p class="text-xs font-medium text-muted uppercase tracking-wide">Attachments</p>
                        <USelect
                          v-model="ofwExport.attachments"
                          :items="ofwExportAttachmentsItems"
                          value-key="value"
                          label-key="label"
                          color="neutral"
                        />
                        <p class="text-[11px] text-muted">
                          Attachments are optional. If you include them, we’ll store the file now; parsing attachment contents is coming later.
                        </p>
                      </div>

                      <div class="space-y-2 pt-1">
                        <UCheckbox
                          v-model="ofwExport.includeOfficialHeader"
                          label="Include official OurFamilyWizard header"
                          color="primary"
                        />
                        <UCheckbox
                          v-model="ofwExport.includeReplies"
                          label="Include message replies"
                          color="primary"
                        />
                        <div class="space-y-1">
                          <UCheckbox
                            v-model="ofwExport.includeProfessionalPrivate"
                            label="Include private messages with your Professional"
                            color="primary"
                          />
                          <p class="text-[11px] text-muted pl-6">
                            Optional. By default, private messages between just you and your Professional are excluded from reports.
                          </p>
                        </div>
                        <UCheckbox
                          v-model="ofwExport.newPagePerMessage"
                          label="New page per message"
                          color="primary"
                        />
                      </div>

                      <div class="rounded-lg bg-elevated/50 border border-default p-3 text-xs text-muted">
                        <p class="font-medium text-highlighted mb-1">Optional</p>
                        <ul class="list-disc pl-4 space-y-1">
                          <li>Limit the date range if you want to focus on a specific period.</li>
                          <li>Choose whether to include attachments (parsing those comes later).</li>
                        </ul>
                      </div>
                    </div>

                    <!-- Right: preview -->
                    <div class="rounded-lg border border-default bg-default p-4">
                      <div class="aspect-[4/5] w-full rounded-md border border-default bg-elevated/30 p-3">
                        <div class="space-y-3">
                          <div class="space-y-1">
                            <div class="h-2 w-28 bg-default/70 rounded" />
                            <div class="h-2 w-20 bg-default/60 rounded" />
                            <div class="h-2 w-24 bg-default/60 rounded" />
                            <div class="h-2 w-16 bg-default/60 rounded" />
                          </div>
                          <div class="h-px w-full bg-default/70" />
                          <div class="space-y-2">
                            <div class="h-2 w-full bg-default/60 rounded" />
                            <div class="h-2 w-11/12 bg-default/60 rounded" />
                            <div class="h-2 w-10/12 bg-default/60 rounded" />
                            <div class="h-2 w-8/12 bg-default/60 rounded" />
                          </div>
                          <div class="h-px w-full bg-default/70" />
                          <div class="space-y-2">
                            <div class="h-2 w-full bg-default/60 rounded" />
                            <div class="h-2 w-11/12 bg-default/60 rounded" />
                            <div class="h-2 w-9/12 bg-default/60 rounded" />
                          </div>
                        </div>
                      </div>
                      <p class="text-xs text-muted mt-3">
                        When you’re done in OFW, click <span class="font-medium text-highlighted">Download</span> and upload the PDF below.
                      </p>
                    </div>
                  </div>
                </div>

                <!-- Hidden file input -->
                <input
                  ref="fileInputRef"
                  type="file"
                  accept=".pdf"
                  class="hidden"
                  @change="onFileSelected"
                >

                <!-- Drop zone -->
                <div
                  class="border-2 border-dashed rounded-lg p-8 text-center space-y-3 transition-colors cursor-pointer"
                  :class="dragOver ? 'border-primary bg-primary/5' : 'border-default hover:border-primary/50'"
                  @click="triggerFileInput"
                  @dragover.prevent="dragOver = true"
                  @dragleave="dragOver = false"
                  @drop.prevent="onDrop"
                >
                  <UIcon v-if="state.loading.value" name="i-lucide-loader-circle" class="size-12 text-primary mx-auto animate-spin" />
                  <UIcon v-else name="i-lucide-upload-cloud" class="size-12 text-muted mx-auto" />
                  <div v-if="state.loading.value">
                    <p class="text-sm font-medium text-highlighted">{{ state.uploadProgress.value }}</p>
                    <p class="text-xs text-muted">{{ selectedFile?.name }}</p>
                  </div>
                  <div v-else>
                    <p class="text-sm font-medium text-highlighted">Click to select or drag and drop</p>
                    <p class="text-xs text-muted">OFW Message Report PDF</p>
                  </div>
                </div>

                <div class="flex items-center gap-2 text-xs text-muted bg-elevated rounded-lg p-3">
                  <UIcon name="i-lucide-info" class="size-4 shrink-0" />
                  <p>Upload an OFW "Messages Report" PDF export. The parser will extract all messages, threads, and metadata deterministically.</p>
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
                :class="entry.sender === state.stats.value.senders[0]?.name ? 'bg-primary' : 'bg-primary/60'"
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

