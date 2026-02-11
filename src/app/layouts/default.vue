<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const open = ref(false)
const { state, bootstrapCorpus } = useCorpus()

onMounted(() => {
  bootstrapCorpus()
})

const links = [[{
  label: 'Upload',
  icon: 'i-lucide-upload',
  to: '/upload',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Overview',
  icon: 'i-lucide-layout-dashboard',
  to: '/overview',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Messages',
  icon: 'i-lucide-message-square-text',
  to: '/messages',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Threads',
  icon: 'i-lucide-messages-square',
  to: '/messages/threads',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Query',
  icon: 'i-lucide-search',
  to: '/query',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Timeline',
  icon: 'i-lucide-calendar-clock',
  to: '/timeline',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Export',
  icon: 'i-lucide-download',
  to: '/export',
  onSelect: () => {
    open.value = false
  }
}], [{
  label: 'Dev Workbench',
  icon: 'i-lucide-flask-conical',
  to: '/dev',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Help & Docs',
  icon: 'i-lucide-info',
  to: '#',
  disabled: true
}]] satisfies NavigationMenuItem[][]

const groups = computed(() => [{
  id: 'links',
  label: 'Go to',
  items: links[0]
}])
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="default"
      v-model:open="open"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink to="/" class="flex items-center px-1" :class="collapsed ? 'justify-center' : ''">
          <AppLogo :show-text="!collapsed" />
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton :collapsed="collapsed" class="bg-transparent ring-default" />

        <!-- Corpus info below search (expanded) -->
        <div v-if="!collapsed" class="px-1 mb-3">
          <!-- Corpus loaded state -->
          <div v-if="state.loaded.value" class="flex items-center gap-2 p-2 rounded-lg bg-elevated/50 border border-default">
            <div class="relative shrink-0">
              <UIcon name="i-lucide-file-check-2" class="size-4 text-primary" />
            </div>
            <div class="min-w-0">
              <p class="text-xs font-medium text-highlighted truncate">{{ state.filename.value }}</p>
              <p class="text-[10px] text-muted">{{ state.stats.value?.total_documents }} messages</p>
            </div>
          </div>

          <!-- Loading state -->
          <div v-else-if="state.loading.value" class="flex items-center gap-2 p-2 rounded-lg bg-elevated/50 border border-default">
            <UIcon name="i-lucide-loader-circle" class="size-4 text-primary animate-spin shrink-0" />
            <div class="min-w-0">
              <p class="text-xs font-medium text-highlighted truncate">{{ state.uploadProgress.value }}</p>
              <p class="text-[10px] text-muted">Please wait...</p>
            </div>
          </div>

          <!-- Empty state -->
          <div v-else class="flex items-center gap-2 p-2 rounded-lg bg-elevated/50 border border-default">
            <UIcon name="i-lucide-file-text" class="size-4 text-muted shrink-0" />
            <div class="min-w-0">
              <p class="text-xs font-medium text-highlighted truncate">No corpus</p>
              <p class="text-[10px] text-muted">Upload to begin</p>
            </div>
          </div>
        </div>

        <!-- Corpus info (collapsed state - just show icon) -->
        <UTooltip v-else :text="state.loaded.value ? (state.filename.value ?? 'Corpus loaded') : 'No corpus loaded'" class="mb-3">
          <div class="flex items-center justify-center p-2 rounded-lg bg-elevated/50 border border-default mx-1">
            <UIcon
              v-if="state.loaded.value"
              name="i-lucide-file-check-2"
              class="size-4 text-primary"
            />
            <UIcon
              v-else-if="state.loading.value"
              name="i-lucide-loader-circle"
              class="size-4 text-primary animate-spin"
            />
            <UIcon
              v-else
              name="i-lucide-file-text"
              class="size-4 text-muted"
            />
          </div>
        </UTooltip>

        <UNavigationMenu
          :collapsed="collapsed"
          :items="links[0]"
          orientation="vertical"
          tooltip
          popover
        />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="links[1]"
          orientation="vertical"
          tooltip
          class="mt-auto"
        />
      </template>

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <UDashboardSearch :groups="groups" />

    <slot />
  </UDashboardGroup>
</template>
