<template>
  <div>
    <UHeader title="Sift">
      <template #title>
        <AppLogo />
      </template>

      <template #right>
        <UColorModeButton />
        <UButton
          label="Open app"
          to="/overview"
          trailing-icon="i-lucide-arrow-right"
          color="primary"
          size="sm"
        />
      </template>
    </UHeader>

    <UMain>
      <slot />
    </UMain>

    <USeparator />

    <UFooter>
      <template #left>
        <p class="text-sm text-muted">
          &copy; {{ new Date().getFullYear() }} Monument Labs
        </p>
      </template>

      <template #right>
        <UButton
          label="Open app"
          to="/overview"
          trailing-icon="i-lucide-arrow-right"
          color="neutral"
          variant="ghost"
        />
      </template>
    </UFooter>
  </div>
</template>
