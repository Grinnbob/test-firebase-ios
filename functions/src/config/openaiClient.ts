import { OpenAI } from 'openai'

let client: OpenAI | null = null

export function getOpenAI(): OpenAI {
  if (!client) {
    const key = process.env.OPENAI_API_KEY
    if (!key) throw new Error('OPENAI_API_KEY not set')
    client = new OpenAI({ apiKey: key })
  }
  return client
}
