import OpenAI from 'openai'

let _client: OpenAI | null = null

export function useOpenAI(): OpenAI {
  if (!_client) {
    const config = useRuntimeConfig()
    const apiKey = config.openaiApiKey as string

    if (!apiKey) {
      throw createError({
        statusCode: 500,
        message: 'OPENAI_API_KEY is not configured. Add it to your .env file.'
      })
    }

    _client = new OpenAI({ apiKey })
  }

  return _client
}
