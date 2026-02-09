<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const open = ref(false)
const { state } = useCorpus()

const links = [[{
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
        <!-- Corpus loaded state -->
        <div v-if="state.loaded.value" class="flex items-center gap-2 px-1" :class="collapsed ? 'justify-center' : ''">
          <div class="relative shrink-0">
            <UIcon name="i-lucide-file-check-2" class="size-5 text-primary" />
          </div>
          <div v-if="!collapsed" class="min-w-0">
            <p class="text-sm font-medium text-highlighted truncate">{{ state.filename.value }}</p>
            <p class="text-xs text-muted">{{ state.stats.value?.total_documents }} messages loaded</p>
          </div>
        </div>

        <!-- Loading state -->
        <div v-else-if="state.loading.value" class="flex items-center gap-2 px-1" :class="collapsed ? 'justify-center' : ''">
          <UIcon name="i-lucide-loader-circle" class="size-5 text-primary animate-spin shrink-0" />
          <div v-if="!collapsed" class="min-w-0">
            <p class="text-sm font-medium text-highlighted truncate">{{ state.uploadProgress.value }}</p>
            <p class="text-xs text-muted">Please wait...</p>
          </div>
        </div>

        <!-- Empty state -->
        <div v-else class="flex items-center gap-2 px-1" :class="collapsed ? 'justify-center' : ''">
          <UIcon name="i-lucide-file-text" class="size-5 text-muted shrink-0" />
          <div v-if="!collapsed" class="min-w-0">
            <p class="text-sm font-medium text-highlighted truncate">No corpus loaded</p>
            <p class="text-xs text-muted">Upload a file to begin</p>
          </div>
        </div>
      </template>
    </UDashboardSidebar>

    <UDashboardSearch :groups="groups" />

    <slot />
  </UDashboardGroup>
</template>
