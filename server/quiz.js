const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash'

const CATEGORY_LABELS = {
  history: {
    en: 'Uzbek history — rulers, empires, cities, key events',
    uz: "O'zbekiston tarixi — hukmdorlar, imperiyalar, shaharlar, muhim voqealar",
  },
  facts: {
    en: 'Interesting facts about Uzbekistan — culture, food, traditions, geography, crafts',
    uz: "O'zbekiston haqida qiziqarli faktlar — madaniyat, taomlar, an'analar, geografiya, hunarmandchilik",
  },
}

function buildPrompt(categories, language) {
  const isUz = language === 'uz'
  const topics = categories
    .map((c) => CATEGORY_LABELS[c]?.[isUz ? 'uz' : 'en'])
    .filter(Boolean)
    .join('; ')

  const langName = isUz ? 'Uzbek (Latin script)' : 'English'

  return `Generate exactly 5 multiple-choice quiz questions about: ${topics}.

Write everything in ${langName}.

Rules:
- Each question must have exactly 4 options.
- Exactly one option is correct.
- Questions should be factual and verifiable, not opinion.
- Vary the difficulty: some easy, some harder.
- Keep each question under 20 words and each option under 8 words.
- Do not repeat the same subject twice.

Respond with ONLY a JSON array, no markdown, no explanation:
[
  {"question": "...", "options": ["...", "...", "...", "..."], "correctIndex": 0},
  ...
]`
}

function parseQuestions(raw) {
  // Strip markdown fences if the model wrapped the JSON.
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim()

  let parsed
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error('Model did not return valid JSON')
  }

  if (!Array.isArray(parsed)) throw new Error('Expected an array of questions')

  const valid = parsed.filter(
    (q) =>
      q &&
      typeof q.question === 'string' &&
      Array.isArray(q.options) &&
      q.options.length === 4 &&
      q.options.every((o) => typeof o === 'string') &&
      Number.isInteger(q.correctIndex) &&
      q.correctIndex >= 0 &&
      q.correctIndex <= 3,
  )

  if (valid.length < 5) throw new Error(`Only ${valid.length} valid questions returned`)

  return valid.slice(0, 5)
}

export async function handleQuiz(categories = ['history'], language = 'en') {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('No API key configured')

  const safeCategories = categories.filter((c) => CATEGORY_LABELS[c])
  if (!safeCategories.length) safeCategories.push('history')

  const requestBody = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: buildPrompt(safeCategories, language) }] }],
    generationConfig: {
      maxOutputTokens: 1200,
      temperature: 1.0,
      thinkingConfig: { thinkingBudget: 0 },
    },
  })

  // Try up to 3 times — the model occasionally returns malformed output.
  let lastError
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: requestBody,
        },
      )

      if (!response.ok) throw new Error(`Gemini API error ${response.status}`)

      const data = await response.json()
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''

      return parseQuestions(text)
    } catch (err) {
      lastError = err
      console.warn(`[Quiz] attempt ${attempt}/3 failed:`, err.message)
    }
  }

  throw lastError
}