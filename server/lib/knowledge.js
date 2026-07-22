import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { cosineSimilarity } from './embeddings.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const VECTORS_PATH = join(__dirname, '..', 'data', 'vectors.json')

const EMPTY = { model: null, chunks: [] }

let cache = null
let cacheMtime = 0

// Loads vectors.json, re-reading only when the file changes on disk so re-indexing
// takes effect without a server restart.
export async function loadVectors() {
  try {
    const info = await stat(VECTORS_PATH)
    if (cache && info.mtimeMs === cacheMtime) return cache
    const raw = await readFile(VECTORS_PATH, 'utf-8')
    cache = JSON.parse(raw)
    cacheMtime = info.mtimeMs
    return cache
  } catch {
    cache = EMPTY
    return cache
  }
}

export async function getChunkCount() {
  const { chunks } = await loadVectors()
  return chunks?.length ?? 0
}

export async function retrieve(queryEmbedding, k = 4) {
  const { chunks } = await loadVectors()
  if (!chunks?.length) return []

  return chunks
    .map((chunk) => ({
      text: chunk.text,
      source: chunk.source,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}
