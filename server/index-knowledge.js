import 'dotenv/config'
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { embedText, getEmbedModel } from './lib/embeddings.js'
import { VECTORS_PATH } from './lib/knowledge.js'
import { CHUNKER_ID, chunkMarkdownFile } from './lib/chunking.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const KNOWLEDGE_DIR = join(__dirname, '..', 'knowledge')

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Free-tier embedding quotas can return 429 partway through a run. Retrying a
// few times keeps one rate-limit blip from losing the whole index.
async function embedWithRetry(text, attempts = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await embedText(text, 'RETRIEVAL_DOCUMENT')
    } catch (err) {
      if (attempt >= attempts) throw err
      const waitMs = 2000 * 2 ** (attempt - 1)
      console.warn(`\n  embed failed (${err.message}); retrying in ${waitMs / 1000}s...`)
      await delay(waitMs)
    }
  }
}

function fileTitle(markdown, fallback) {
  const match = markdown.replace(/\r\n?/g, '\n').match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : fallback
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

  console.log(`Indexing with embedding model: ${getEmbedModel()} (chunker: ${CHUNKER_ID})\n`)

  const fileMeta = {}
  const records = []

  for (const file of files) {
    const raw = await readFile(join(KNOWLEDGE_DIR, file), 'utf-8')
    const chunks = chunkMarkdownFile(file, raw)

    fileMeta[file] = {
      title: fileTitle(raw, file),
      aliases: chunks[0]?.aliases ?? [],
      sources: chunks[0]?.sources ?? [],
    }

    console.log(`${file}: ${chunks.length} chunk(s)`)

    for (let i = 0; i < chunks.length; i++) {
      // aliases/sources are stored once per file (in `files`), not on every chunk.
      const chunk = { ...chunks[i] }
      delete chunk.aliases
      delete chunk.sources
      process.stdout.write(
        `  ${i + 1}/${chunks.length} ${chunk.headingPath.join(' > ') || '(untitled)'} (${chunk.words} words)... `,
      )
      const embedding = await embedWithRetry(chunk.text)
      console.log(`embedded (${embedding.length} dims)`)
      records.push({ ...chunk, embedding })
    }
  }

  await mkdir(dirname(VECTORS_PATH), { recursive: true })
  await writeFile(
    VECTORS_PATH,
    JSON.stringify(
      {
        model: getEmbedModel(),
        chunker: CHUNKER_ID,
        createdAt: new Date().toISOString(),
        files: fileMeta,
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
