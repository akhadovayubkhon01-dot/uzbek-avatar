import 'dotenv/config'

async function main() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set. Add it to .env first.')
    process.exit(1)
  }

  const models = []
  let pageToken = ''

  do {
    const url = new URL('https://generativelanguage.googleapis.com/v1beta/models')
    url.searchParams.set('pageSize', '100')
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const response = await fetch(url, {
      headers: { 'x-goog-api-key': apiKey },
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error?.message || `ListModels API error ${response.status}`)
    }

    const data = await response.json()
    models.push(...(data.models ?? []))
    pageToken = data.nextPageToken ?? ''
  } while (pageToken)

  const chatModels = models
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .sort()

  console.log(`Models supporting generateContent (${chatModels.length}):\n`)
  chatModels.forEach((name) => console.log(`  ${name}`))
}

main().catch((err) => {
  console.error('Failed to list models:', err.message)
  process.exit(1)
})
