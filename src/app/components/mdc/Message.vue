<script setup lang="ts">
const props = defineProps<{
  id?: string
  sender?: string
  timestamp?: string
  tone?: string
  number?: string | number
}>()

const toneColor = computed((): 'error' | 'success' | 'neutral' => {
  if (props.tone === 'hostile') return 'error'
  if (props.tone === 'cooperative') return 'success'
  return 'neutral'
})

const senderInitials = computed(() => {
  if (!props.sender) return '?'
  return props.sender
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
})

const formattedTime = computed(() => {
  if (!props.timestamp) return ''
  const d = new Date(props.timestamp)
  if (isNaN(d.getTime())) return props.timestamp
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
})

function navigateToMessage() {
  if (props.id) {
    navigateTo(`/messages?msg=${props.id}`)
  }
}
</script>

<template>
  <div
    class="not-prose max-w-lg rounded-lg border border-default bg-default overflow-hidden my-2 hover:bg-elevated/50 transition-colors cursor-pointer group"
    role="button"
    tabindex="0"
    @click="navigateToMessage"
    @keydown.enter="navigateToMessage"
  >
    <div class="px-3.5 py-3">
      <!-- Header -->
      <div class="flex items-center gap-2 mb-1.5">
        <div
          class="size-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 bg-primary/10 text-primary"
        >
          {{ senderInitials }}
        </div>
        <span class="text-sm font-semibold text-highlighted">{{ sender || 'Unknown' }}</span>
        <span v-if="number" class="text-xs text-muted font-mono">#{{ number }}</span>
        <UBadge
          v-if="tone"
          :label="tone"
          variant="subtle"
          :color="toneColor"
          size="sm"
        />
        <span class="text-xs text-muted ml-auto shrink-0">{{ formattedTime }}</span>
      </div>

      <!-- Body -->
      <div class="text-sm text-highlighted leading-relaxed pl-8">
        <MDCSlot unwrap="p" />
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-end mt-2 pl-8">
        <span class="text-xs text-dimmed group-hover:text-primary transition-colors flex items-center gap-1">
          View message
          <UIcon name="i-lucide-arrow-right" class="size-3" />
        </span>
      </div>
    </div>
  </div>
</template>
