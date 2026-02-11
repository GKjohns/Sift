<script setup lang="ts">
useDashboard()

const { state, uploadCorpus } = useCorpus()

const fileInputRef = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const dragOver = ref(false)

// OFW export settings (reference UI - matches screenshot)
const ofwExport = reactive({
  messages: 'All In Folder',
  sort: 'Oldest to newest',
  attachments: 'Exclude all attachments',
  includeOfficialHeader: false,
  includeReplies: true,
  includeProfessionalPrivate: false,
  newPagePerMessage: true,
})

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

// Navigate to messages after successful upload
watch(() => state.loaded.value, (loaded) => {
  if (loaded && selectedFile.value) {
    // Give user a moment to see success, then navigate
    setTimeout(() => {
      navigateTo('/messages')
    }, 1500)
  }
})
</script>

<template>
  <UDashboardPanel id="upload">
    <template #header>
      <UDashboardNavbar title="Upload Corpus">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UBadge v-if="state.loaded.value" label="Corpus Loaded" variant="subtle" color="success" icon="i-lucide-check" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-5xl mx-auto space-y-6">
        <!-- Header -->
        <div class="space-y-2">
          <h2 class="text-2xl font-bold text-highlighted">Upload OurFamilyWizard Messages</h2>
          <p class="text-muted">
            Export your messages from OurFamilyWizard as a PDF, then upload it here to analyze the content.
          </p>
        </div>

        <!-- Upload Zone and Instructions Side by Side -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Upload Zone -->
          <div class="rounded-lg border border-default bg-default p-6 space-y-4">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-upload" class="size-5 text-primary" />
              <h3 class="text-base font-semibold text-highlighted">Upload Your PDF</h3>
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
              class="border-2 border-dashed rounded-lg p-12 text-center space-y-4 transition-all cursor-pointer"
              :class="[
                dragOver ? 'border-primary bg-primary/5 scale-[1.02]' : 'border-default hover:border-primary/50',
                state.loading.value ? 'pointer-events-none' : ''
              ]"
              @click="triggerFileInput"
              @dragover.prevent="dragOver = true"
              @dragleave="dragOver = false"
              @drop.prevent="onDrop"
            >
              <!-- Loading state -->
              <template v-if="state.loading.value">
                <UIcon name="i-lucide-loader-circle" class="size-16 text-primary mx-auto animate-spin" />
                <div class="space-y-1">
                  <p class="text-lg font-semibold text-highlighted">{{ state.uploadProgress.value }}</p>
                  <p class="text-sm text-muted">{{ selectedFile?.name }}</p>
                </div>
              </template>

              <!-- Success state -->
              <template v-else-if="state.loaded.value && selectedFile">
                <div class="inline-flex p-4 rounded-full bg-success/10">
                  <UIcon name="i-lucide-check-circle-2" class="size-16 text-success" />
                </div>
                <div class="space-y-2">
                  <p class="text-lg font-semibold text-highlighted">Upload Successful!</p>
                  <p class="text-sm text-muted">{{ selectedFile.name }}</p>
                  <p class="text-xs text-muted">Redirecting to messages...</p>
                </div>
              </template>

              <!-- Default state -->
              <template v-else>
                <div class="inline-flex p-4 rounded-full bg-primary/10">
                  <UIcon name="i-lucide-upload-cloud" class="size-16 text-primary" />
                </div>
                <div class="space-y-2">
                  <p class="text-lg font-semibold text-highlighted">Drop your PDF here</p>
                  <p class="text-sm text-muted">or click to browse files</p>
                  <p class="text-xs text-muted">OurFamilyWizard Messages Report PDF only</p>
                </div>
              </template>
            </div>

            <!-- Info -->
            <div class="flex items-start gap-3 text-sm bg-elevated rounded-lg p-4">
              <UIcon name="i-lucide-info" class="size-4 text-muted shrink-0 mt-0.5" />
              <div class="space-y-1">
                <p class="text-highlighted font-medium">What happens after upload?</p>
                <ul class="list-disc list-inside text-muted space-y-0.5">
                  <li>Parser extracts all messages & threads</li>
                  <li>Messages are indexed and searchable</li>
                  <li>Thread relationships auto-detected</li>
                  <li>Redirected to messages view</li>
                </ul>
              </div>
            </div>
          </div>

          <!-- Instructions Card -->
          <div class="rounded-lg border border-default bg-default p-6 space-y-4">
            <div class="flex items-start gap-3">
              <div class="p-2 rounded-lg bg-primary/10 shrink-0">
                <UIcon name="i-lucide-info" class="size-5 text-primary" />
              </div>
              <div class="space-y-1 flex-1">
                <h3 class="text-lg font-semibold text-highlighted">How to Export from OFW</h3>
                <p class="text-sm text-muted">Follow these steps to export correctly</p>
              </div>
            </div>

            <ol class="space-y-4 list-decimal list-inside text-sm text-muted">
              <li class="space-y-2">
                <span class="text-highlighted font-medium">Navigate to Messages</span>
                <p class="ml-6">Go to the Messages section in OurFamilyWizard</p>
              </li>
              <li class="space-y-2">
                <span class="text-highlighted font-medium">Click "Report"</span>
                <p class="ml-6">Look for the Report button in the messages view toolbar</p>
              </li>
              <li class="space-y-2">
                <span class="text-highlighted font-medium">Configure export settings</span>
                <p class="ml-6">Use the settings shown below (you can adjust the date range as needed)</p>
              </li>
              <li class="space-y-2">
                <span class="text-highlighted font-medium">Click Download</span>
                <p class="ml-6">Save the PDF to your computer, then upload it on the left</p>
              </li>
            </ol>
          </div>
        </div>

        <!-- Settings Reference (recreates the OFW UI) -->
        <div class="rounded-lg border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent p-6 space-y-4">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-settings" class="size-5 text-primary" />
            <h3 class="text-base font-semibold text-highlighted">Required Export Settings</h3>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Left: Settings form (visual reference) -->
            <div class="space-y-4 rounded-lg bg-default border border-default p-5">
              <div class="space-y-2">
                <label class="text-xs font-medium text-muted uppercase tracking-wide">Messages</label>
                <div class="w-full px-3 py-2 rounded-lg border border-default bg-elevated text-sm text-highlighted">
                  {{ ofwExport.messages }}
                </div>
                <p class="text-xs text-muted">You can set the date range to whatever you want</p>
              </div>

              <div class="space-y-2">
                <label class="text-xs font-medium text-muted uppercase tracking-wide">Sort messages by</label>
                <div class="w-full px-3 py-2 rounded-lg border border-default bg-elevated text-sm text-highlighted">
                  {{ ofwExport.sort }}
                </div>
              </div>

              <div class="space-y-2">
                <label class="text-xs font-medium text-muted uppercase tracking-wide">Attachments</label>
                <div class="w-full px-3 py-2 rounded-lg border border-default bg-elevated text-sm text-highlighted">
                  {{ ofwExport.attachments }}
                </div>
              </div>

              <div class="space-y-3 pt-2">
                <label class="flex items-center gap-2 text-sm">
                  <div class="size-4 rounded border border-default bg-elevated shrink-0" />
                  <span class="text-muted">Include official OurFamilyWizard header</span>
                </label>
                <div class="flex items-start gap-2">
                  <div class="size-4 rounded border-2 border-primary bg-primary shrink-0 mt-0.5 flex items-center justify-center">
                    <UIcon name="i-lucide-check" class="size-3 text-inverted" />
                  </div>
                  <div class="space-y-1">
                    <span class="text-sm text-highlighted font-medium">Include message replies</span>
                    <p class="text-xs text-primary font-medium">✓ REQUIRED</p>
                  </div>
                </div>
                <label class="flex items-center gap-2 text-sm">
                  <div class="size-4 rounded border border-default bg-elevated shrink-0" />
                  <span class="text-muted">Include private messages with your Professional</span>
                </label>
                <div class="flex items-start gap-2">
                  <div class="size-4 rounded border-2 border-primary bg-primary shrink-0 mt-0.5 flex items-center justify-center">
                    <UIcon name="i-lucide-check" class="size-3 text-inverted" />
                  </div>
                  <div class="space-y-1">
                    <span class="text-sm text-highlighted font-medium">New page per message</span>
                    <p class="text-xs text-primary font-medium">✓ REQUIRED</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Right: Key requirements highlight -->
            <div class="space-y-4">
              <div class="rounded-lg bg-primary/10 border border-primary/30 p-4">
                <div class="flex items-start gap-3">
                  <UIcon name="i-lucide-alert-circle" class="size-5 text-primary shrink-0 mt-0.5" />
                  <div class="space-y-2">
                    <h4 class="text-sm font-semibold text-primary">Critical Settings</h4>
                    <ul class="space-y-2 text-sm text-highlighted">
                      <li class="flex items-start gap-2">
                        <UIcon name="i-lucide-check-circle-2" class="size-4 text-primary shrink-0 mt-0.5" />
                        <span><strong>Uncheck</strong> "Include official OurFamilyWizard header"</span>
                      </li>
                      <li class="flex items-start gap-2">
                        <UIcon name="i-lucide-check-circle-2" class="size-4 text-primary shrink-0 mt-0.5" />
                        <span><strong>Check</strong> "Include message replies"</span>
                      </li>
                      <li class="flex items-start gap-2">
                        <UIcon name="i-lucide-check-circle-2" class="size-4 text-primary shrink-0 mt-0.5" />
                        <span><strong>Check</strong> "New page per message"</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <div class="rounded-lg bg-elevated border border-default p-4 space-y-2">
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-sparkles" class="size-4 text-muted" />
                  <h4 class="text-sm font-semibold text-highlighted">Optional</h4>
                </div>
                <ul class="space-y-2 text-sm text-muted">
                  <li class="flex items-start gap-2">
                    <span class="text-muted">•</span>
                    <span>Set the date range to focus on a specific period</span>
                  </li>
                  <li class="flex items-start gap-2">
                    <span class="text-muted">•</span>
                    <span>Choose sorting order (oldest to newest recommended)</span>
                  </li>
                  <li class="flex items-start gap-2">
                    <span class="text-muted">•</span>
                    <span>Include or exclude attachments (parser focuses on text)</span>
                  </li>
                </ul>
              </div>

              <div class="rounded-lg bg-elevated border border-default p-4">
                <div class="flex items-center gap-2 mb-2">
                  <UIcon name="i-lucide-image" class="size-4 text-muted" />
                  <h4 class="text-sm font-semibold text-highlighted">Screenshot Reference</h4>
                </div>
                <div class="aspect-video w-full rounded-lg border border-default bg-muted/10 flex items-center justify-center overflow-hidden">
                  <img
                    src="/ofw-export-screenshot.png"
                    alt="OurFamilyWizard export settings"
                    class="w-full h-full object-cover"
                  >
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
