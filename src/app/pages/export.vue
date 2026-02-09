<script setup lang="ts">
import type { ExportPreview } from '~/types'

const { state } = useCorpus()

const format = ref<'html' | 'csv' | 'json'>('html')
const formatOptions = [
  { label: 'HTML (Pretty Thread)', value: 'html' as const },
  { label: 'CSV (Structured Data)', value: 'csv' as const },
  { label: 'JSON (Full Dump)', value: 'json' as const }
]

const scope = ref('all')
const scopeOptions = [
  { label: 'All Documents', value: 'all' },
  { label: 'Current Filter / DocSet', value: 'filter' },
  { label: 'Timeline Events', value: 'timeline' }
]

const includeLabels = ref(true)
const includeAuditTrail = ref(false)
const includeToneAnalysis = ref(true)
const downloading = ref(false)

const exportBody = computed(() => ({
  format: format.value,
  scope: scope.value,
  includeLabels: includeLabels.value,
  includeToneAnalysis: includeToneAnalysis.value,
  includeAuditTrail: includeAuditTrail.value
}))

// Preview: useFetch reacts to exportBody changes automatically.
// Returns null when corpus isn't loaded (no request made).
const { data: preview, status: previewStatus } = useFetch<ExportPreview>('/api/export/preview', {
  method: 'POST',
  body: exportBody,
  immediate: false,
  watch: [exportBody, () => state.loaded.value]
})

const loadingPreview = computed(() => previewStatus.value === 'pending')

async function downloadExport() {
  downloading.value = true
  try {
    const result = await $fetch<{ content: string; filename: string; mime: string }>('/api/export/download', {
      method: 'POST',
      body: exportBody.value
    })

    // Create blob and trigger download
    const blob = new Blob([result.content], { type: result.mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = result.filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    useToast().add({
      title: 'Export downloaded',
      description: `${result.filename} saved successfully.`,
      color: 'success'
    })
  } catch {
    useToast().add({
      title: 'Export failed',
      description: 'Could not generate the export file.',
      color: 'error'
    })
  } finally {
    downloading.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="export" :ui="{ body: 'lg:py-12' }">
    <template #header>
      <UDashboardNavbar title="Export">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-2xl mx-auto w-full space-y-8">
        <!-- Format Selector -->
        <div class="space-y-3">
          <h3 class="text-sm font-semibold text-highlighted">Format</h3>
          <p class="text-sm text-muted">Choose the output format for your export.</p>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              v-for="opt in formatOptions"
              :key="opt.value"
              class="rounded-lg border p-4 text-left transition-colors"
              :class="format === opt.value
                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                : 'border-default bg-default hover:bg-elevated'"
              @click="format = opt.value"
            >
              <div class="flex items-center gap-2">
                <UIcon
                  :name="opt.value === 'html' ? 'i-lucide-file-code' : opt.value === 'csv' ? 'i-lucide-table' : 'i-lucide-braces'"
                  class="size-5"
                  :class="format === opt.value ? 'text-primary' : 'text-muted'"
                />
                <span class="text-sm font-medium text-highlighted">{{ opt.label.split(' (')[0] }}</span>
              </div>
              <p class="text-xs text-muted mt-1">{{ opt.label.match(/\((.+)\)/)?.[1] }}</p>
            </button>
          </div>
        </div>

        <USeparator />

        <!-- Scope Selector -->
        <div class="space-y-3">
          <h3 class="text-sm font-semibold text-highlighted">Scope</h3>
          <p class="text-sm text-muted">What to include in the export.</p>
          <USelect
            v-model="scope"
            :items="scopeOptions"
            class="max-w-xs"
          />
        </div>

        <USeparator />

        <!-- Include Options -->
        <div class="space-y-3">
          <h3 class="text-sm font-semibold text-highlighted">Include</h3>
          <p class="text-sm text-muted">Additional data to include in the export.</p>
          <div class="space-y-4">
            <label class="flex items-center gap-3 cursor-pointer">
              <USwitch v-model="includeLabels" />
              <div>
                <p class="text-sm font-medium text-highlighted">Labels</p>
                <p class="text-xs text-muted">Include any computed tone or category labels</p>
              </div>
            </label>
            <label class="flex items-center gap-3 cursor-pointer">
              <USwitch v-model="includeToneAnalysis" />
              <div>
                <p class="text-sm font-medium text-highlighted">Tone Analysis</p>
                <p class="text-xs text-muted">Include hostile / neutral / cooperative classifications</p>
              </div>
            </label>
            <label class="flex items-center gap-3 cursor-pointer">
              <USwitch v-model="includeAuditTrail" />
              <div>
                <p class="text-sm font-medium text-highlighted">Audit Trail</p>
                <p class="text-xs text-muted">Append the full chain of operations for reproducibility</p>
              </div>
            </label>
          </div>
        </div>

        <USeparator />

        <!-- Preview -->
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold text-highlighted">Preview</h3>
            <div v-if="preview" class="flex items-center gap-3 text-xs text-muted">
              <span>{{ preview.row_count }} rows</span>
              <span>·</span>
              <span>~{{ preview.estimated_size }}</span>
            </div>
          </div>

          <!-- Loading -->
          <div v-if="loadingPreview" class="flex items-center justify-center h-48 border border-default rounded-lg bg-default">
            <div class="text-center space-y-2">
              <UIcon name="i-lucide-loader-circle" class="size-6 text-primary animate-spin mx-auto" />
              <p class="text-sm text-muted">Generating preview...</p>
            </div>
          </div>

          <!-- Preview Content -->
          <div v-else-if="preview && state.loaded.value" class="border border-default rounded-lg bg-default overflow-hidden">
            <pre class="p-4 text-xs font-mono text-muted overflow-x-auto max-h-64 leading-relaxed">{{ preview.preview_content }}</pre>
          </div>

          <!-- Empty state -->
          <div v-else class="flex items-center justify-center h-48 border border-dashed border-default rounded-lg bg-default">
            <div class="text-center space-y-2">
              <UIcon name="i-lucide-eye" class="size-10 text-muted" />
              <p class="text-sm text-muted">Export preview will appear here</p>
              <p class="text-xs text-muted">Upload a corpus first to enable export</p>
            </div>
          </div>
        </div>

        <!-- Download -->
        <div class="flex justify-end">
          <UButton
            label="Download Export"
            icon="i-lucide-download"
            size="lg"
            :disabled="!state.loaded.value"
            :loading="downloading"
            @click="downloadExport"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
