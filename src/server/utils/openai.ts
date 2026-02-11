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

    // Prevent requests from hanging indefinitely if the network/model stalls.
    // (OpenAI Node SDK expects timeout in milliseconds.)
    _client = new OpenAI({
      apiKey,
      timeout: 120_000,
      maxRetries: 1
    })
  }

  return _client
}
