const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001'

export function getEmbedModel() {
  return EMBED_MODEL
}

// taskType hints Gemini to optimize the vector: RETRIEVAL_DOCUMENT when indexing,
// RETRIEVAL_QUERY when embedding a user question. This measurably improves recall.
export async function embedText(text, taskType = 'RETRIEVAL_DOCUMENT') {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set')

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text }] },
        taskType,
      }),
    },
  )

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message || `Embedding API error ${response.status}`)
  }

  const data = await response.json()
  return data.embedding?.values ?? []
}

export function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0

  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}
