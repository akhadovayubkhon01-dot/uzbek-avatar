import 'dotenv/config'
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { embedText, getEmbedModel } from './lib/embeddings.js'
import { VECTORS_PATH } from './lib/knowledge.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const KNOWLEDGE_DIR = join(__dirname, '..', 'knowledge')

function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length
}

// Split on blank lines to preserve paragraph boundaries, then greedily pack
// paragraphs into chunks of roughly minWords..maxWords.
function chunkByParagraphs(text, minWords = 200, maxWords = 500) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)

  const chunks = []
  let current = []
  let currentWords = 0

  const flush = () => {
    if (current.length) {
      chunks.push(current.join('\n\n'))
      current = []
      currentWords = 0
    }
  }

  for (const paragraph of paragraphs) {
    const words = countWords(paragraph)

    // Starting this paragraph would blow past the cap — close the current chunk first.
    if (currentWords > 0 && currentWords + words > maxWords) flush()

    current.push(paragraph)
    currentWords += words

    // Enough material for a standalone chunk.
    if (currentWords >= minWords) flush()
  }

  flush()
  return chunks
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set. Add it to .env before indexing.')
    process.exit(1)
  }

  let files
  try {
    files = (await readdir(KNOWLEDGE_DIR)).filter((f) => f.endsWith('.md')).sort()
  } catch {
    console.error(`Knowledge folder not found at ${KNOWLEDGE_DIR}`)
    process.exit(1)
  }

  if (!files.length) {
    console.error('No .md files found in knowledge/.')
    process.exit(1)
  }

  console.log(`Indexing with embedding model: ${getEmbedModel()}\n`)

  const records = []
  for (const file of files) {
    const raw = await readFile(join(KNOWLEDGE_DIR, file), 'utf-8')
    const chunks = chunkByParagraphs(raw)
    console.log(`${file}: ${chunks.length} chunk(s)`)

    for (let i = 0; i < chunks.length; i++) {
      const text = chunks[i]
      process.stdout.write(`  chunk ${i + 1}/${chunks.length} (${countWords(text)} words)... `)
      const embedding = await embedText(text, 'RETRIEVAL_DOCUMENT')
      console.log(`embedded (${embedding.length} dims)`)
      records.push({ source: file, text, embedding })
    }
  }

  const dataDir = dirname(VECTORS_PATH)
  await mkdir(dataDir, { recursive: true })
  await writeFile(
    VECTORS_PATH,
    JSON.stringify(
      {
        model: getEmbedModel(),
        createdAt: new Date().toISOString(),
        chunks: records,
      },
      null,
      2,
    ),
  )

  console.log(`\nIndexed ${records.length} chunk(s) from ${files.length} file(s).`)
  console.log(`Saved to ${VECTORS_PATH}`)
}

main().catch((err) => {
  console.error('\nIndexing failed:', err.message)
  process.exit(1)
})
