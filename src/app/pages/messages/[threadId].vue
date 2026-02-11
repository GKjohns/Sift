<script setup lang="ts">
import type { ThreadDetailResponse } from '~/types'

const route = useRoute()
const threadId = computed(() => route.params.threadId as string)

const { data: thread, status } = useFetch<ThreadDetailResponse>(
  () => `/api/messages/thread/${threadId.value}`,
  { immediate: true }
)

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

// Highlighted message from query param
const highlightedMessageId = computed(() => route.query.msg as string | undefined)

const userName = computed(() => thread.value?.senders?.[0] ?? '')
const assistantName = computed(() => thread.value?.senders?.[1] ?? '')

const chatMessages = computed(() => {
  if (!thread.value) return []

  return thread.value.messages.map((m) => ({
    id: m.id,
    role: m.sender === userName.value ? 'user' : 'assistant',
    parts: [{ type: 'text', text: m.text }],
    metadata: m
  }))
})

const userProps = computed(() => ({
  avatar: userName.value ? { alt: userName.value } : { icon: 'i-lucide-user' },
  variant: 'soft' as const,
  side: 'left' as const
}))

const assistantProps = computed(() => ({
  avatar: assistantName.value ? { alt: assistantName.value } : { icon: 'i-lucide-user' },
  variant: 'naked' as const,
  side: 'left' as const
}))
</script>

<template>
  <UDashboardPanel id="thread-detail">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #left>
          <UButton
            to="/messages"
            icon="i-lucide-arrow-left"
            variant="ghost"
            color="neutral"
            size="sm"
            class="mr-2"
          />
          <div class="min-w-0">
            <h2 v-if="thread" class="text-sm font-medium text-highlighted truncate">
              {{ thread.subject }}
            </h2>
            <p v-if="thread" class="text-xs text-muted">
              {{ thread.messages.length }} messages &middot; {{ thread.senders.join(' & ') }}
            </p>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- Loading -->
      <div v-if="status === 'pending'" class="flex items-center justify-center h-96">
        <div class="text-center space-y-3">
          <UIcon name="i-lucide-loader-circle" class="size-8 text-primary animate-spin mx-auto" />
          <p class="text-sm text-muted">Loading thread...</p>
        </div>
      </div>

      <!-- Error -->
      <div v-else-if="status === 'error'" class="flex flex-col items-center justify-center h-96 space-y-4">
        <div class="rounded-full bg-default p-6">
          <UIcon name="i-lucide-alert-triangle" class="size-12 text-muted" />
        </div>
        <div class="text-center space-y-2">
          <h3 class="text-lg font-medium text-highlighted">Thread not found</h3>
          <p class="text-sm text-muted">This thread may have been removed or doesn't exist.</p>
          <UButton
            label="Back to Threads"
            to="/messages"
            variant="outline"
            color="neutral"
            class="mt-4"
            icon="i-lucide-arrow-left"
          />
        </div>
      </div>

      <!-- Conversation -->
      <div v-else-if="thread" class="max-w-3xl mx-auto w-full py-2">
        <UChatMessages
          :messages="chatMessages"
          :user="userProps"
          :assistant="assistantProps"
          should-auto-scroll
          :should-scroll-to-bottom="true"
          :spacing-offset="24"
          class="px-2 sm:px-0"
        >
          <template #content="{ message }">
            <div
              class="space-y-1"
              :class="highlightedMessageId === message.id ? 'rounded-md bg-primary/5 ring-1 ring-primary/20 p-2 -m-2' : ''"
            >
              <div class="flex items-center gap-2">
                <span class="text-xs font-medium text-highlighted/80">
                  {{ message.metadata?.sender }}
                </span>
                <span v-if="message.metadata?.message_number" class="text-xs text-muted font-mono">
                  #{{ message.metadata?.message_number }}
                </span>
                <UBadge
                  v-if="message.metadata?.tone"
                  :label="`${message.metadata?.tone} ${Math.round((message.metadata?.confidence || 0) * 100)}%`"
                  variant="subtle"
                  :color="toneColor(message.metadata?.tone || null)"
                  size="xs"
                />
                <span class="text-xs text-muted ml-auto shrink-0">
                  {{ message.metadata?.timestamp ? formatTime(message.metadata.timestamp) : '' }}
                </span>
              </div>

              <template v-for="(part, index) in message.parts" :key="`${message.id}-${part.type}-${index}`">
                <p v-if="part.type === 'text'" class="whitespace-pre-wrap text-sm text-highlighted leading-relaxed">
                  {{ part.text }}
                </p>
              </template>

              <p v-if="message.metadata?.word_count" class="text-xs text-muted">
                {{ message.metadata?.word_count }} words
              </p>
            </div>
          </template>
        </UChatMessages>
      </div>
    </template>
  </UDashboardPanel>
</template>
