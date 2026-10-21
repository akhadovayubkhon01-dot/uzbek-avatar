import { createHash } from 'node:crypto'

// Heading-aware Markdown chunking for the knowledge base.
//
// Each chunk is one section (the text under a #, ## or ### heading), so a chunk
// never mixes two people, places or traditions. Every chunk keeps its full
// heading path ("Timurid era > Ulugh Beg"), and that path is embedded together
// with the body. A paragraph such as "He died in 1405" therefore still says
// who "he" is.

export const CHUNKER_ID = 'heading-aware-v1'

const TARGET_MAX_WORDS = 300

// Sections that describe the file rather than answer questions. They are kept
// as metadata on every chunk of the file instead of becoming chunks themselves:
// a list of alternate spellings or URLs is not a passage worth retrieving.
const METADATA_SECTIONS = {
  aliases: 'aliases',
  sources: 'sources',
}

const HEADING_RE = /^(#{1,3})\s+(.+?)\s*#*\s*$/

export function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length
}

function sha256(...parts) {
  // NUL separators keep ("ab", "c") and ("a", "bc") from hashing the same.
  return createHash('sha256').update(parts.join('\u0000')).digest('hex')
}

function splitParagraphs(text) {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}

// Splits Markdown into sections. Windows line endings are normalised first, as
// some files in knowledge/ are CRLF and Git on Windows may convert the rest.
export function parseSections(markdown) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const sections = []
  const stack = [] // stack[i] = heading text at level i + 1
  let body = []

  const flush = () => {
    const text = body.join('\n').trim()
    if (text) sections.push({ headingPath: stack.filter(Boolean), text })
    body = []
  }

  for (const line of lines) {
    const match = line.match(HEADING_RE)
    if (match) {
      flush()
      const level = match[1].length
      stack.length = level - 1
      stack[level - 1] = match[2].trim()
    } else {
      body.push(line)
    }
  }
  flush()

  return sections
}

function metadataKind(headingPath) {
  const last = headingPath[headingPath.length - 1]?.toLowerCase()
  return METADATA_SECTIONS[last] ?? null
}

function parseAliases(text) {
  return text
    .split(/[;\n]/)
    .map((a) => a.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
}

function parseSources(text) {
  return text
    .split('\n')
    .map((s) => s.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
}

// Keeps a section whole when it fits. Only an oversized section is split, and
// only on paragraph boundaries. A single paragraph longer than the target stays
// intact rather than being cut mid-sentence.
function splitSection(text) {
  if (countWords(text) <= TARGET_MAX_WORDS) return [text]

  const pieces = []
  let current = []
  let words = 0

  for (const paragraph of splitParagraphs(text)) {
    const w = countWords(paragraph)
    if (current.length && words + w > TARGET_MAX_WORDS) {
      pieces.push(current.join('\n\n'))
      current = []
      words = 0
    }
    current.push(paragraph)
    words += w
  }
  if (current.length) pieces.push(current.join('\n\n'))

  return pieces
}

// The exact string that is embedded and stored as `text`. The heading path comes
// first so the vector, and the snippet the chat model later sees, both carry
// the section's identity.
export function buildChunkText(headingPath, body) {
  return headingPath.length ? `${headingPath.join(' > ')}\n\n${body}` : body
}

/**
 * Turns one Markdown file into chunk records (without embeddings).
 * - id: stable for a given file + heading path + piece number, so it survives
 *   edits to the wording (useful for incremental re-indexing later).
 * - hash: changes whenever the file, heading path or text changes.
 */
export function chunkMarkdownFile(file, markdown) {
  const sections = parseSections(markdown)
  const aliases = []
  const sources = []
  const content = []

  for (const section of sections) {
    const kind = metadataKind(section.headingPath)
    if (kind === 'aliases') aliases.push(...parseAliases(section.text))
    else if (kind === 'sources') sources.push(...parseSources(section.text))
    else content.push(section)
  }

  const chunks = []
  for (const section of content) {
    const pieces = splitSection(section.text)
    pieces.forEach((body, part) => {
      const pathKey = section.headingPath.join(' > ')
      const text = buildChunkText(section.headingPath, body)
      chunks.push({
        id: sha256(file, pathKey, String(part)).slice(0, 16),
        file,
        headingPath: section.headingPath,
        part,
        parts: pieces.length,
        text,
        words: countWords(body),
        hash: sha256(file, pathKey, text),
        aliases,
        sources,
      })
    })
  }

  return chunks
}
