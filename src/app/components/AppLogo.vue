<script setup lang="ts">
withDefaults(defineProps<{
  showText?: boolean
  markClass?: string
}>(), {
  showText: true,
  markClass: 'h-4'
})
</script>

<template>
  <div class="inline-flex items-center gap-1.5">
    <svg
      viewBox="0 0 48 33"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Sift"
      :class="[markClass, 'w-auto shrink-0 text-primary']"
    >
      <rect x="0" y="0" width="48" height="7" rx="3.5" fill="currentColor" class="fill-primary" />
      <rect x="8" y="13" width="32" height="7" rx="3.5" fill="currentColor" class="fill-primary" />
      <rect x="16" y="26" width="16" height="7" rx="3.5" fill="currentColor" class="fill-primary" />
    </svg>

    <span v-if="showText" class="font-semibold text-2xl tracking-tight text-highlighted">Sift</span>
  </div>
</template>
