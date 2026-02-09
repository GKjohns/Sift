import { createSharedComposable } from '@vueuse/core'
import type { CorpusStats } from '~/types'

export interface CorpusState {
  loaded: boolean
  loading: boolean
  stats: CorpusStats | null
  filename: string | null
  uploadProgress: string | null
}

const _useCorpus = () => {
  const state = reactive<CorpusState>({
    loaded: false,
    loading: false,
    stats: null,
    filename: null,
    uploadProgress: null
  })

  const toast = useToast()

  async function uploadCorpus(filename: string = 'ofw_export.pdf') {
    state.loading = true
    state.uploadProgress = 'Parsing PDF...'
    state.filename = filename

    try {
      // Simulate multi-step progress
      await new Promise(r => setTimeout(r, 500))
      state.uploadProgress = 'Extracting messages...'

      await new Promise(r => setTimeout(r, 400))
      state.uploadProgress = 'Building search index...'

      const result = await $fetch('/api/corpus/upload', { method: 'POST' })

      state.uploadProgress = 'Computing vectors...'
      await new Promise(r => setTimeout(r, 600))

      state.stats = result.stats
      state.loaded = true
      state.uploadProgress = null

      toast.add({
        title: 'Corpus loaded',
        description: result.message,
        color: 'success'
      })
    } catch (e) {
      state.uploadProgress = null
      state.loading = false
      toast.add({
        title: 'Upload failed',
        description: 'Could not parse the uploaded file.',
        color: 'error'
      })
      throw e
    } finally {
      state.loading = false
    }
  }

  async function refreshStats() {
    if (!state.loaded) return
    try {
      const stats = await $fetch('/api/corpus/stats')
      state.stats = stats
    } catch {
      // Silently fail on refresh
    }
  }

  const documentCount = computed(() => state.stats?.total_documents ?? 0)
  const senderNames = computed(() => state.stats?.senders.map(s => s.name) ?? [])
  const dateRange = computed(() => {
    if (!state.stats) return null
    return {
      start: new Date(state.stats.date_range.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      end: new Date(state.stats.date_range.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    }
  })

  return {
    state: toRefs(state),
    uploadCorpus,
    refreshStats,
    documentCount,
    senderNames,
    dateRange
  }
}

export const useCorpus = createSharedComposable(_useCorpus)
