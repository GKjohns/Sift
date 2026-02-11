<script setup lang="ts">
import type { MessageListItem, MessageDetail, MessagesResponse } from '~/types'

const { state, senderNames } = useCorpus()

const route = useRoute()

const search = ref('')
const toneFilter = ref('all')
const senderFilter = ref('all')
const sortOrder = ref('newest')
const expandedMessageId = ref<string | null>(null)
const expandedMessage = ref<MessageDetail | null>(null)
const loadingDetail = ref(false)

// Handle ?msg=doc-XXX query param — auto-expand referenced message
const highlightMsgId = computed(() => {
  const msg = route.query.msg
  return typeof msg === 'string' ? msg : null
})

const toneOptions = [
  { label: 'All Tones', value: 'all' },
  { label: 'Hostile', value: 'hostile' },
  { label: 'Neutral', value: 'neutral' },
  { label: 'Cooperative', value: 'cooperative' }
]

const sortOptions = [
  { label: 'Newest First', value: 'newest' },
  { label: 'Oldest First', value: 'oldest' }
]

// Fetch messages with filters
const { data: messagesData, status: messagesStatus, refresh } = useFetch<MessagesResponse>('/api/messages', {
  query: computed(() => ({
    search: search.value,
    tone: toneFilter.value,
    sender: senderFilter.value,
    sort: sortOrder.value
  })),
  watch: false,
  immediate: false
})

// Debounced search
const debouncedRefresh = useDebounceFn(() => refresh(), 300)
watch([search, toneFilter, senderFilter, sortOrder], () => {
  if (state.loaded.value) debouncedRefresh()
})

// Fetch when corpus loads
watch(() => state.loaded.value, (loaded) => {
  if (loaded) refresh()
}, { immediate: true })

const messages = computed(() => messagesData.value?.messages ?? [])
const totalCount = computed(() => messagesData.value?.total ?? 0)
const senderOptions = computed(() => {
  const senders = messagesData.value?.senders ?? []
  return [
    { label: 'All Senders', value: 'all' },
    ...senders.map(s => ({ label: s, value: s }))
  ]
})

// Expand message to see detail + context
async function toggleMessage(msg: MessageListItem) {
  if (expandedMessageId.value === msg.id) {
    expandedMessageId.value = null
    expandedMessage.value = null
    return
  }

  expandedMessageId.value = msg.id
  loadingDetail.value = true
  try {
    const detail = await $fetch<MessageDetail>(`/api/messages/${msg.id}`)
    expandedMessage.value = detail
  }
  catch {
    expandedMessage.value = null
  }
  finally {
    loadingDetail.value = false
  }
}

// When messages load and there's a ?msg= param, auto-expand that message
watch(messages, (msgs) => {
  if (!highlightMsgId.value || msgs.length === 0) return
  const target = msgs.find(m => m.id === highlightMsgId.value)
  if (target && expandedMessageId.value !== target.id) {
    toggleMessage(target)
    nextTick(() => {
      const el = document.getElementById(`msg-${target.id}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }
})

function formatTime(ts: string) {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function toneColor(tone: string | null): 'error' | 'neutral' | 'success' | undefined {
  if (tone === 'hostile') return 'error'
  if (tone === 'neutral') return 'neutral'
  if (tone === 'cooperative') return 'success'
  return undefined
}

function senderInitial(name: string) {
  return name.split(' ').map(n => n[0]).join('')
}

function isPrimarySender(name: string): boolean {
  return senderNames.value.length > 0 && name === senderNames.value[0]
}

// Highlight search terms in text
function highlightSearch(text: string): string {
  if (!search.value.trim()) return text
  const escaped = search.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escaped})`, 'gi')
  return text.replace(regex, '<mark class="bg-warning/20 text-highlighted rounded px-0.5">$1</mark>')
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
            :label="String(totalCount)"
            variant="subtle"
          />
          <UBadge v-else label="0" variant="subtle" />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Search messages..."
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

          <USelect
            v-model="senderFilter"
            :items="senderOptions"
            placeholder="Sender"
            class="min-w-32"
            :disabled="!state.loaded.value"
          />
        </template>

        <template #right>
          <USelect
            v-model="sortOrder"
            :items="sortOptions"
            icon="i-lucide-arrow-up-down"
            class="min-w-36"
            :disabled="!state.loaded.value"
          />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <!-- Loading -->
      <div v-if="messagesStatus === 'pending' && state.loaded.value" class="flex items-center justify-center h-96">
        <div class="text-center space-y-3">
          <UIcon name="i-lucide-loader-circle" class="size-8 text-primary animate-spin mx-auto" />
          <p class="text-sm text-muted">Loading messages...</p>
        </div>
      </div>

      <!-- Message List -->
      <div v-else-if="state.loaded.value && messages.length > 0" class="divide-y divide-default">
        <div
          v-for="msg in messages"
          :id="`msg-${msg.id}`"
          :key="msg.id"
          class="group"
        >
          <!-- Message Row -->
          <button
            class="w-full text-left p-4 hover:bg-elevated/50 transition-colors flex items-start gap-3"
            :class="{
              'bg-elevated/30': expandedMessageId === msg.id,
              'ring-2 ring-primary/30 ring-inset': highlightMsgId === msg.id
            }"
            @click="toggleMessage(msg)"
          >
            <!-- Sender Avatar -->
            <div
              class="size-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
              :class="isPrimarySender(msg.sender)
                ? 'bg-primary/10 text-primary'
                : 'bg-accented text-toned'"
            >
              {{ senderInitial(msg.sender) }}
            </div>

            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-highlighted truncate">{{ msg.sender }}</span>
                <span class="text-xs text-muted font-mono">#{{ msg.message_number }}</span>
                <UBadge
                  v-if="msg.tone"
                  :label="`${msg.tone} ${Math.round((msg.confidence || 0) * 100)}%`"
                  variant="subtle"
                  :color="toneColor(msg.tone)"
                  size="sm"
                />
                <span class="text-xs text-muted ml-auto shrink-0">{{ formatTime(msg.timestamp) }}</span>
              </div>
              <!-- eslint-disable-next-line vue/no-v-html -->
              <p class="text-sm text-muted mt-1 line-clamp-2" v-html="highlightSearch(msg.preview)" />
            </div>

            <UIcon
              name="i-lucide-chevron-down"
              class="size-4 text-muted shrink-0 mt-1 transition-transform"
              :class="{ 'rotate-180': expandedMessageId === msg.id }"
            />
          </button>

          <!-- Expanded Detail -->
          <div v-if="expandedMessageId === msg.id" class="border-t border-default bg-elevated/20 px-4 py-4">
            <div v-if="loadingDetail" class="flex items-center gap-2 text-sm text-muted py-4">
              <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
              Loading context...
            </div>

            <div v-else-if="expandedMessage" class="space-y-4">
              <!-- Context Before -->
              <div v-if="expandedMessage.context_before.length > 0" class="space-y-2">
                <p class="text-xs font-medium text-muted uppercase tracking-wide">Previous messages</p>
                <div
                  v-for="ctx in expandedMessage.context_before"
                  :key="ctx.id"
                  class="rounded-lg border border-default bg-default p-3 opacity-60"
                >
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-xs font-medium text-highlighted">{{ ctx.sender }}</span>
                    <span class="text-xs text-muted font-mono">#{{ ctx.message_number }}</span>
                    <span class="text-xs text-muted ml-auto">{{ formatTime(ctx.timestamp) }}</span>
                  </div>
                  <p class="text-xs text-muted">{{ ctx.preview }}</p>
                </div>
              </div>

              <!-- Current Message (full text) -->
              <div class="rounded-lg border-2 border-primary/30 bg-default p-4">
                <div class="flex items-center gap-2 mb-2">
                  <span class="text-sm font-medium text-highlighted">{{ expandedMessage.sender }}</span>
                  <span class="text-xs text-muted">→ {{ expandedMessage.recipient }}</span>
                  <span class="text-xs text-muted font-mono">#{{ expandedMessage.message_number }}</span>
                  <UBadge
                    v-if="expandedMessage.tone"
                    :label="`${expandedMessage.tone} ${Math.round((expandedMessage.confidence || 0) * 100)}%`"
                    variant="subtle"
                    :color="toneColor(expandedMessage.tone)"
                    size="sm"
                  />
                </div>
                <p class="text-sm text-highlighted leading-relaxed whitespace-pre-wrap">{{ expandedMessage.text }}</p>
                <p class="text-xs text-muted mt-2">{{ expandedMessage.word_count }} words · {{ formatTime(expandedMessage.timestamp) }}</p>
              </div>

              <!-- Context After -->
              <div v-if="expandedMessage.context_after.length > 0" class="space-y-2">
                <p class="text-xs font-medium text-muted uppercase tracking-wide">Following messages</p>
                <div
                  v-for="ctx in expandedMessage.context_after"
                  :key="ctx.id"
                  class="rounded-lg border border-default bg-default p-3 opacity-60"
                >
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-xs font-medium text-highlighted">{{ ctx.sender }}</span>
                    <span class="text-xs text-muted font-mono">#{{ ctx.message_number }}</span>
                    <span class="text-xs text-muted ml-auto">{{ formatTime(ctx.timestamp) }}</span>
                  </div>
                  <p class="text-xs text-muted">{{ ctx.preview }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- No results -->
      <div v-else-if="state.loaded.value && messages.length === 0" class="flex flex-col items-center justify-center h-96 space-y-4">
        <div class="rounded-full bg-default p-6">
          <UIcon name="i-lucide-search-x" class="size-12 text-muted" />
        </div>
        <div class="text-center space-y-2">
          <h3 class="text-lg font-medium text-highlighted">No messages match your filters</h3>
          <p class="text-sm text-muted max-w-md">Try adjusting your search terms, tone filter, or sender filter.</p>
          <UButton
            label="Clear Filters"
            variant="outline"
            color="neutral"
            class="mt-4"
            icon="i-lucide-x"
            @click="search = ''; toneFilter = 'all'; senderFilter = 'all'"
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
            Upload a corpus from the Overview page to browse and filter individual messages.
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
