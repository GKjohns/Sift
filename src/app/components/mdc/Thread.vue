<script setup lang="ts">
defineProps<{
  id?: string
  subject?: string
  count?: string | number
}>()
</script>

<template>
  <div class="not-prose max-w-xl rounded-xl border border-default overflow-hidden my-3">
    <!-- Thread header -->
    <div class="flex items-center gap-2 px-4 py-2.5 border-b border-default bg-elevated/50">
      <UIcon name="i-lucide-messages-square" class="size-4 text-primary shrink-0" />
      <span class="text-sm font-semibold text-highlighted">{{ subject || `Thread ${id || ''}` }}</span>
      <UBadge
        v-if="count"
        :label="`${count} messages`"
        variant="subtle"
        color="neutral"
        size="sm"
        class="ml-auto"
      />
    </div>

    <!-- Thread messages -->
    <div class="px-3 py-2">
      <MDCSlot unwrap="p" />
    </div>
  </div>
</template>
