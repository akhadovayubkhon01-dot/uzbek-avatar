import { buildSystemPrompt } from './prompts'
import { getDemoResponse } from '../data/demoResponses'

export async function chat(messages, language, topicId) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, language, topicId }),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.error || `API error ${response.status}`)
  }

  return data
}

export async function checkAiStatus() {
  try {
    const response = await fetch('/api/health')
    if (!response.ok) return { ok: false, ai: false }
    return response.json()
  } catch {
    return { ok: false, ai: false }
  }
}
