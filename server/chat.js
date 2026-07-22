import { buildSystemPrompt } from '../src/lib/prompts.js'
import { getDemoResponse } from '../src/data/demoResponses.js'
import { embedText } from './lib/embeddings.js'
import { retrieve } from './lib/knowledge.js'

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash'
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite'
const RAG_TOP_K = 4

// Embed the question, pull the most similar knowledge chunks, and return a prompt
// addition instructing the model to answer from those sources. Returns '' when no
// index exists or retrieval fails, so chat still works without a knowledge base.
async function buildRagContext(question) {
  if (!question) return ''

  try {
    const queryEmbedding = await embedText(question, 'RETRIEVAL_QUERY')
    const top = await retrieve(queryEmbedding, RAG_TOP_K)
    if (!top.length) return ''

    console.log(`\n[RAG] Question: ${question}`)
    top.forEach((chunk, i) => {
      const preview = chunk.text.replace(/\s+/g, ' ').slice(0, 90)
      console.log(`  ${i + 1}. score=${chunk.score.toFixed(3)} source=${chunk.source} :: ${preview}...`)
    })

    const sources = top
      .map((chunk, i) => `[${i + 1}] Manba: ${chunk.source}\n${chunk.text}`)
      .join('\n\n')

    return `\n\nQuyidagi manbalar savolga aloqador bo'lsa, ularga asoslanib javob ber. Agar manbalar savolni qamrab olmasa, umumiy bilimlaringdan foydalanib javob ber, lekin bu ma'lumot maxsus manbalardan emasligini qisqacha aytib o't.\n\n${sources}`
  } catch (err) {
    console.error('[RAG] retrieval skipped:', err.message)
    return ''
  }
}

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

  const ragContext = await buildRagContext(lastUser?.content ?? '')
  const system = buildSystemPrompt(language) + ragContext
  const contents = toGeminiContents(messages)

  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: {
      maxOutputTokens: 800,
    },
  })

  const callModel = (model) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: requestBody,
    })

  const maxAttempts = 3
  const retryDelays = [2000, 4000]
  let answeringModel = GEMINI_MODEL
  let response

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    response = await callModel(GEMINI_MODEL)

    const retryable = response.status === 503 || response.status === 429
    if (response.ok || !retryable || attempt === maxAttempts) break

    const waitMs = retryDelays[attempt - 1]
    console.warn(
      `[Gemini] ${response.status} on attempt ${attempt}/${maxAttempts}, retrying in ${waitMs / 1000}s...`,
    )
    await delay(waitMs)
  }

  // Primary model exhausted on overload/rate-limit — try the fallback model once.
  if (!response.ok && (response.status === 503 || response.status === 429)) {
    console.warn(
      `[Gemini] ${GEMINI_MODEL} unavailable (${response.status}) after ${maxAttempts} attempts, falling back to ${FALLBACK_MODEL}...`,
    )
    response = await callModel(FALLBACK_MODEL)
    answeringModel = FALLBACK_MODEL
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message || `Gemini API error ${response.status}`)
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('')

  console.log(`[Gemini] answered by ${answeringModel}`)

  return {
    content: text ?? '',
    mode: 'ai',
    model: answeringModel,
  }
}
