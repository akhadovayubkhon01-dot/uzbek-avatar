import { buildSystemPrompt } from '../src/lib/prompts.js'
import { getDemoResponse } from '../src/data/demoResponses.js'

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

function toGeminiContents(messages) {
  const filtered = messages.filter((m) => m.role === 'user' || m.role === 'assistant')
  const firstUser = filtered.findIndex((m) => m.role === 'user')
  if (firstUser === -1) return []

  return filtered.slice(firstUser).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function handleChat(messages, language = 'en', topicId = null) {
  const apiKey = process.env.GEMINI_API_KEY
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')

  if (!apiKey) {
    await delay(600)
    return {
      content: getDemoResponse(lastUser?.content ?? '', language, topicId),
      mode: 'demo',
    }
  }

  const system = buildSystemPrompt(language)
  const contents = toGeminiContents(messages)

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: {
          maxOutputTokens: 800,
        },
      }),
    },
  )

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message || `Gemini API error ${response.status}`)
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('')

  return {
    content: text ?? '',
    mode: 'ai',
  }
}
