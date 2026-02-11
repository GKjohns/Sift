import { createSharedComposable } from '@vueuse/core'
import type { CorpusStats } from '~/types'

export interface CorpusState {
  loaded: boolean
  loading: boolean
  stats: CorpusStats | null
  filename: string | null
  uploadProgress: string | null
  parseInfo: {
    totalMessages: number
    reportEntries: number
    senders: string[]
    threads: number
    dateRange: { start: string; end: string }
  } | null
}

const _useCorpus = () => {
  const state = reactive<CorpusState>({
    loaded: false,
    loading: false,
    stats: null,
    filename: null,
    uploadProgress: null,
    parseInfo: null,
  })

  const toast = useToast()

  /**
   * Upload a real OFW PDF file to the server for parsing.
   */
  async function uploadCorpus(file: File) {
    state.loading = true
    state.uploadProgress = 'Reading PDF...'
    state.filename = file.name

    try {
      const formData = new FormData()
      formData.append('file', file)

      state.uploadProgress = 'Parsing messages...'

      const result = await $fetch('/api/corpus/upload', {
        method: 'POST',
        body: formData,
      })

      state.stats = result.stats
      state.parseInfo = result.parseInfo
      state.loaded = true
      state.uploadProgress = null

      toast.add({
        title: 'Corpus loaded',
        description: result.message,
        color: 'success',
      })
    }
    catch (e: any) {
      state.uploadProgress = null
      state.loading = false
      toast.add({
        title: 'Upload failed',
        description: e?.data?.message || 'Could not parse the uploaded file.',
        color: 'error',
      })
      throw e
    }
    finally {
      state.loading = false
    }
  }

  async function refreshStats() {
    if (!state.loaded) return
    try {
      const stats = await $fetch('/api/corpus/stats')
      state.stats = stats
    }
    catch {
      // Silently fail on refresh
    }
  }

  /**
   * If the server already has a corpus loaded (in-memory), hydrate the client state.
   * Useful for direct navigation / page refresh during dev.
   */
  async function bootstrapCorpus() {
    if (state.loaded || state.loading) return
    try {
      const stats = await $fetch<CorpusStats>('/api/corpus/stats')
      state.stats = stats
      state.loaded = true
    }
    catch {
      // No corpus on server (or server not ready) — ignore
    }
  }

  const documentCount = computed(() => state.stats?.total_documents ?? 0)
  const senderNames = computed(() => state.stats?.senders.map(s => s.name) ?? [])
  const dateRange = computed(() => {
    if (!state.stats) return null
    return {
      start: new Date(state.stats.date_range.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      end: new Date(state.stats.date_range.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    }
  })

  return {
    state: toRefs(state),
    uploadCorpus,
    refreshStats,
    bootstrapCorpus,
    documentCount,
    senderNames,
    dateRange,
  }
}

export const useCorpus = createSharedComposable(_useCorpus)
