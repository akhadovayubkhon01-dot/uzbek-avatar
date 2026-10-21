// Shared by the retrieval and grounding evaluations.

// Lowercase, unify apostrophe variants (o' oʻ o‘ o’ o`) and collapse whitespace,
// so a ground-truth string matches regardless of how the file spells it.
export function normalize(text) {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[ʻʼ‘’`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

// `target` is a single-answer case or one evidence item of a multi-part case.
export function relevanceOptions(target) {
  return [{ file: target.expectedFile, passages: target.expectedPassages }, ...(target.alsoAcceptable ?? [])]
}

export function chunkFile(chunk) {
  return chunk.file ?? chunk.source
}

// A chunk is relevant when it comes from an expected file and contains every
// expected passage.
export function isRelevant(chunk, target) {
  const haystack = normalize(`${(chunk.headingPath ?? []).join(' > ')}\n${chunk.text}`)
  return relevanceOptions(target).some(
    (opt) => chunkFile(chunk) === opt.file && opt.passages.every((p) => haystack.includes(normalize(p))),
  )
}
