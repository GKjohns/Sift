<script setup lang="ts">
definePageMeta({
  layout: 'landing'
})
</script>

<template>
  <div>
    <UPageHero
      title="Sift"
      description="Turn an OFW export into signal. Upload a corpus, then explore volume, tone, timelines, and specific questions—fast."
      :links="[{
        label: 'Open app',
        to: '/overview',
        trailingIcon: 'i-lucide-arrow-right',
        size: 'xl'
      }, {
        label: 'View overview',
        to: '/overview',
        icon: 'i-lucide-layout-dashboard',
        size: 'xl',
        color: 'neutral',
        variant: 'subtle'
      }]"
    />

    <UPageSection
      id="features"
      title="Built for evidence-first analysis"
      description="Deterministic operations where possible, LLMs where helpful—so you can trust the output and explain how you got there."
      :features="[{
        icon: 'i-lucide-search',
        title: 'Query the corpus',
        description: 'Ask questions and pull relevant context without manually hunting across threads.'
      }, {
        icon: 'i-lucide-bar-chart-3',
        title: 'Measure volume and trends',
        description: 'See patterns over time and understand where attention is going.'
      }, {
        icon: 'i-lucide-brain',
        title: 'Add analysis when needed',
        description: 'Run higher-level labeling (like tone) once you’ve anchored the facts.'
      }, {
        icon: 'i-lucide-download',
        title: 'Export results',
        description: 'Package key findings and supporting excerpts for sharing or review.'
      }]"
    />

    <UPageSection>
      <UPageCTA
        title="Ready to sift your corpus?"
        description="Open the app to upload a corpus and start exploring."
        variant="subtle"
        :links="[{
          label: 'Open app',
          to: '/overview',
          trailingIcon: 'i-lucide-arrow-right',
          color: 'neutral'
        }]"
      />
    </UPageSection>
  </div>
</template>
