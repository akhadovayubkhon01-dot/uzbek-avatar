// Retrieval evaluation for the knowledge base.
//
//   npm run eval:rag -- --label heading-aware             regression set (rag-questions.json)
//   npm run eval:rag -- --questions rag-questions-hard.json --label heading-aware
//   npm run eval:rag -- --check                           validate the regression set offline
//   npm run eval:rag -- --check --questions rag-questions-hard.json
//
// Each query is embedded with RETRIEVAL_QUERY and every chunk in vectors.json is
// ranked by cosine similarity, which is the same scoring the chat uses. A chunk
// counts as relevant only when it comes from an expected file and contains every
// expected passage, so a chunk from the right file about the wrong person
// doesn't count.
//
// Query embeddings are cached in server/eval/.cache/ so two runs against
// different indexes compare against identical query vectors.
//
// Results are written to results-<label>.json (regression set) or
// results-<resultsPrefix>-<label>.json (other sets). An existing results file is
// never overwritten unless --force is given, so earlier runs stay comparable.
//
// This script only measures. It does not apply any similarity cutoff.

import 'dotenv/config'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cosineSimilarity, embedText, getEmbedModel } from '../lib/embeddings.js'
import { VECTORS_PATH } from '../lib/knowledge.js'
import { countWords, parseSections } from '../lib/chunking.js'
import { chunkFile, isRelevant, normalize, relevanceOptions } from './lib/relevance.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_QUESTIONS = 'rag-questions.json'
const CACHE_PATH = join(__dirname, '.cache', 'query-embeddings.json')
const KNOWLEDGE_DIR = join(__dirname, '..', '..', 'knowledge')

const HIT_KS = [1, 3, 4, 5]
// The chat injects the top 4 chunks (RAG_TOP_K in server/chat.js), so @4 is
// what the model actually receives.
const CHAT_TOP_K = 4
const SHOW_TOP = 5
// A "close call" is a question whose correct chunk beats the best wrong chunk
// by less than this. Diagnostic only.
const CLOSE_CALL_MARGIN = 0.02

const NEGATIVE_TYPES = ['in-domain-unsupported', 'out-of-domain']
const METADATA_HEADINGS = new Set(['aliases', 'sources'])

// ---------- helpers ----------

function parseArgs(argv) {
  const args = { label: null, vectors: VECTORS_PATH, check: false, questions: DEFAULT_QUESTIONS, force: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--label') args.label = argv[++i]
    else if (a === '--vectors') args.vectors = argv[++i]
    else if (a === '--questions') args.questions = argv[++i]
    else if (a === '--check') args.check = true
    else if (a === '--force') args.force = true
  }
  return args
}

// A bare file name refers to server/eval/; anything else is resolved normally.
function resolveQuestionsPath(p) {
  if (isAbsolute(p)) return p
  const fromCwd = resolve(process.cwd(), p)
  if (existsSync(fromCwd) && p !== basename(p)) return fromCwd
  return join(__dirname, p)
}

function chunkLabel(chunk) {
  if (chunk.headingPath?.length) return chunk.headingPath.join(' > ')
  return chunk.text.replace(/\s+/g, ' ').slice(0, 70) + '…'
}

const isMultiPart = (c) => c.answerable && Array.isArray(c.evidence)
// The regression set's unrelated questions predate negativeType; they are all
// off-topic, so they are reported as out-of-domain (and flagged as inferred).
const negativeTypeOf = (c) => c.negativeType ?? 'out-of-domain'

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

async function embedQueryWithRetry(text, attempts = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await embedText(text, 'RETRIEVAL_QUERY')
    } catch (err) {
      if (attempt >= attempts) throw err
      const waitMs = 2000 * 2 ** (attempt - 1)
      console.warn(`  embed failed (${err.message}); retrying in ${waitMs / 1000}s...`)
      await delay(waitMs)
    }
  }
}

async function loadJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf-8'))
  } catch {
    return fallback
  }
}

const round = (x, d = 3) => (x == null || Number.isNaN(x) ? null : Number(x.toFixed(d)))
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const pct = (x) => (x == null ? '   -  ' : `${(x * 100).toFixed(1).padStart(5)}%`)
const fmt = (x) => (x == null ? '-' : String(x))

// Linear-interpolation percentile (same as numpy's default and Excel PERCENTILE.INC).
function percentile(sorted, p) {
  if (!sorted.length) return null
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

function distribution(values) {
  const xs = values.filter((v) => v != null).sort((a, b) => a - b)
  if (!xs.length) return { n: 0, min: null, p25: null, median: null, p75: null, max: null, mean: null }
  return {
    n: xs.length,
    min: round(xs[0], 4),
    p25: round(percentile(xs, 0.25), 4),
    median: round(percentile(xs, 0.5), 4),
    p75: round(percentile(xs, 0.75), 4),
    max: round(xs[xs.length - 1], 4),
    mean: round(mean(xs), 4),
  }
}

// How much two score populations overlap. `a` is expected to score higher
// (answerable), `b` lower (negatives). AUC = P(random a > random b), ties count
// half; 1.0 means perfectly separable, 0.5 means indistinguishable. This
// describes the data only; no cutoff is chosen from it.
function overlap(aValues, bValues) {
  const a = aValues.filter((v) => v != null)
  const b = bValues.filter((v) => v != null)
  if (!a.length || !b.length) return null
  const aMin = Math.min(...a)
  const bMax = Math.max(...b)
  let wins = 0
  for (const x of a) for (const y of b) wins += x > y ? 1 : x === y ? 0.5 : 0
  return {
    nA: a.length,
    nB: b.length,
    aMin: round(aMin, 4),
    bMax: round(bMax, 4),
    overlaps: bMax >= aMin,
    overlapRange: bMax >= aMin ? [round(aMin, 4), round(bMax, 4)] : null,
    gap: round(aMin - bMax, 4),
    aAtOrBelowBMax: a.filter((x) => x <= bMax).length,
    bAtOrAboveAMin: b.filter((y) => y >= aMin).length,
    auc: round(wins / (a.length * b.length), 4),
  }
}

// ---------- offline validation ----------

async function checkQuestions(cases) {
  const files = new Set((await readdir(KNOWLEDGE_DIR)).filter((f) => f.endsWith('.md')))
  const cache = {}
  const load = async (file) => {
    if (!cache[file]) {
      const raw = await readFile(join(KNOWLEDGE_DIR, file), 'utf-8')
      const sections = parseSections(raw)
      cache[file] = {
        whole: normalize(raw),
        sections: sections.map((s) => normalize(`${s.headingPath.join(' > ')}\n${s.text}`)),
        // Content only: the Aliases/Sources metadata is not embedded or shown to the chat.
        content: normalize(
          sections
            .filter((s) => !METADATA_HEADINGS.has(s.headingPath.at(-1)?.toLowerCase()))
            .map((s) => `${s.headingPath.join(' > ')}\n${s.text}`)
            .join('\n'),
        ),
      }
    }
    return cache[file]
  }

  let errors = 0
  let warnings = 0
  const ids = new Set()
  const err = (msg) => (console.log(`ERROR ${msg}`), errors++)
  const warn = (msg) => (console.log(`WARN  ${msg}`), warnings++)

  const checkTarget = async (id, target) => {
    if (!target.expectedFile || !Array.isArray(target.expectedPassages) || !target.expectedPassages.length) {
      return err(`${id}: needs expectedFile and a non-empty expectedPassages`)
    }
    for (const opt of relevanceOptions(target)) {
      if (!files.has(opt.file)) {
        err(`${id}: file not found in knowledge/: ${opt.file}`)
        continue
      }
      const { whole, sections } = await load(opt.file)
      const missing = opt.passages.filter((p) => !whole.includes(normalize(p)))
      if (missing.length) {
        err(`${id}: not found in ${opt.file}: ${missing.map((m) => JSON.stringify(m)).join(', ')}`)
        continue
      }
      if (!sections.some((s) => opt.passages.every((p) => s.includes(normalize(p))))) {
        warn(`${id}: passages in ${opt.file} never appear in the same section`)
      }
    }
  }

  for (const c of cases) {
    if (ids.has(c.id)) err(`${c.id}: duplicate id`)
    ids.add(c.id)
    if (!['en', 'uz'].includes(c.language)) err(`${c.id}: language must be "en" or "uz"`)

    if (!c.answerable) {
      if (c.negativeType != null && !NEGATIVE_TYPES.includes(c.negativeType)) {
        err(`${c.id}: negativeType must be one of ${NEGATIVE_TYPES.join(', ')}`)
      }
      for (const term of c.absentTerms ?? []) {
        for (const f of files) {
          if ((await load(f)).content.includes(normalize(term))) {
            err(`${c.id}: absentTerm ${JSON.stringify(term)} occurs in ${f}; this negative may be answerable`)
          }
        }
      }
      continue
    }

    if (isMultiPart(c)) {
      if (c.evidence.length < 2) err(`${c.id}: a multi-part case needs at least 2 evidence items`)
      for (const [i, ev] of c.evidence.entries()) await checkTarget(`${c.id} evidence[${i}]`, ev)
    } else {
      await checkTarget(c.id, c)
    }
  }

  const single = cases.filter((c) => c.answerable && !isMultiPart(c))
  const multi = cases.filter(isMultiPart)
  const neg = cases.filter((c) => !c.answerable)
  const count = (xs, lang) => xs.filter((c) => c.language === lang).length
  const negByType = NEGATIVE_TYPES.map(
    (t) => `${neg.filter((c) => negativeTypeOf(c) === t).length} ${t}`,
  ).join(', ')
  console.log(
    `\n${cases.length} cases: ${single.length} single-answer (${count(single, 'en')} en, ${count(single, 'uz')} uz), ` +
      `${multi.length} multi-part, ${neg.length} negative (${negByType}). ${errors} error(s), ${warnings} warning(s).`,
  )
  return errors === 0
}

// ---------- metrics ----------

function summarize(results) {
  const n = results.length
  if (!n) return null
  const ranks = results.map((r) => r.firstRelevantRank)
  const found = ranks.filter((r) => r != null)
  const margins = results.map((r) => r.margin).filter((m) => m != null)
  const summary = { n }
  for (const k of HIT_KS) summary[`hit@${k}`] = round(ranks.filter((r) => r != null && r <= k).length / n)
  summary.mrr = round(mean(ranks.map((r) => (r == null ? 0 : 1 / r))))
  summary.avgFirstRelevantRank = round(mean(found), 2)
  summary.noRelevantChunk = ranks.filter((r) => r == null).length
  summary[`precision@${CHAT_TOP_K}`] = round(mean(results.map((r) => r.precisionAtChatK)))
  summary[`contextWords@${CHAT_TOP_K}`] = round(mean(results.map((r) => r.contextWordsAtChatK)), 1)
  summary.meanBestRelevantScore = round(mean(results.map((r) => r.bestRelevantScore).filter((s) => s != null)))
  summary.meanTopScore = round(mean(results.map((r) => r.topScore)))
  summary.meanTopIncorrectScore = round(mean(results.map((r) => r.topIncorrectScore).filter((s) => s != null)))
  summary.meanMargin = round(mean(margins))
  summary.closeCalls = margins.filter((m) => m >= 0 && m < CLOSE_CALL_MARGIN).length
  summary.negativeMargins = margins.filter((m) => m < 0).length
  return summary
}

function summarizeMulti(results) {
  const n = results.length
  if (!n) return null
  const share = (fn) => round(results.filter(fn).length / n)
  return {
    n,
    'anyEvidence@1': share((r) => r.anyEvidenceRank != null && r.anyEvidenceRank <= 1),
    [`anyEvidence@${CHAT_TOP_K}`]: share((r) => r.anyEvidenceRank != null && r.anyEvidenceRank <= CHAT_TOP_K),
    [`allEvidence@${CHAT_TOP_K}`]: share((r) => r.allEvidenceRank != null && r.allEvidenceRank <= CHAT_TOP_K),
    'allEvidence@5': share((r) => r.allEvidenceRank != null && r.allEvidenceRank <= 5),
    meanEvidenceItemsInTop4: round(mean(results.map((r) => r.evidenceItemsInChatK))),
  }
}

function printTable(groups, rows) {
  const cols = Object.keys(groups)
  const w = cols.map((c) => Math.max(12, c.length + 2))
  console.log(''.padEnd(36) + cols.map((c, i) => c.padStart(w[i])).join(''))
  for (const [name, fn] of rows) {
    console.log(name.padEnd(36) + cols.map((c, i) => String(fn(groups[c]) ?? '-').padStart(w[i])).join(''))
  }
}

const SINGLE_ROWS = [
  ['questions', (g) => g?.n ?? 0],
  ...HIT_KS.map((k) => [`Hit@${k}${k === CHAT_TOP_K ? ' (what chat sends)' : ''}`, (g) => pct(g?.[`hit@${k}`])]),
  ['MRR', (g) => fmt(g?.mrr)],
  ['avg rank of 1st relevant', (g) => fmt(g?.avgFirstRelevantRank)],
  ['no relevant chunk at all', (g) => fmt(g?.noRelevantChunk)],
  [`precision@${CHAT_TOP_K}`, (g) => pct(g?.[`precision@${CHAT_TOP_K}`])],
  [`words sent to chat (top ${CHAT_TOP_K})`, (g) => fmt(g?.[`contextWords@${CHAT_TOP_K}`])],
  ['mean best relevant score', (g) => fmt(g?.meanBestRelevantScore)],
  ['mean top incorrect score', (g) => fmt(g?.meanTopIncorrectScore)],
  ['mean margin (relevant - incorrect)', (g) => fmt(g?.meanMargin)],
  [`close calls (0 <= margin < ${CLOSE_CALL_MARGIN})`, (g) => fmt(g?.closeCalls)],
  ['wrong chunk ranked first', (g) => fmt(g?.negativeMargins)],
]

function printDistributions(dists) {
  const cols = ['n', 'min', 'p25', 'median', 'p75', 'max', 'mean']
  console.log(''.padEnd(44) + cols.map((c) => c.padStart(8)).join(''))
  for (const [name, d] of Object.entries(dists)) {
    console.log(name.padEnd(44) + cols.map((c) => fmt(d[c]).padStart(8)).join(''))
  }
}

// ---------- main ----------

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const questionsPath = resolveQuestionsPath(args.questions)
  const questions = JSON.parse(await readFile(questionsPath, 'utf-8'))
  const cases = questions.cases
  console.log(`questions: ${questionsPath}${questions.split ? ` (split: ${questions.split})` : ''}`)

  if (args.check) {
    const ok = await checkQuestions(cases)
    process.exit(ok ? 0 : 1)
  }

  if (!existsSync(args.vectors)) {
    console.error(`No index at ${args.vectors}. Run "npm run index" (or "npm run index:legacy") first.`)
    process.exit(1)
  }

  const vectors = JSON.parse(await readFile(args.vectors, 'utf-8'))
  const chunks = vectors.chunks ?? []
  const chunker = vectors.chunker ?? 'legacy-paragraph'
  const label = args.label ?? (chunker === 'legacy-paragraph' ? 'baseline' : chunker)
  const model = getEmbedModel()

  const prefix = questions.resultsPrefix ? `${questions.resultsPrefix}-` : ''
  const outPath = join(__dirname, `results-${prefix}${label}.json`)
  if (existsSync(outPath) && !args.force) {
    console.error(
      `${outPath} already exists. Use a new --label so earlier results stay comparable (or --force to overwrite).`,
    )
    process.exit(1)
  }

  if (!chunks.length) {
    console.error('vectors.json contains no chunks.')
    process.exit(1)
  }
  if (vectors.model && vectors.model !== model) {
    console.error(`Index was built with ${vectors.model}, but queries would use ${model}. Re-index first.`)
    process.exit(1)
  }
  if (!(await checkQuestions(cases))) {
    console.error('\nFix the question file before evaluating.')
    process.exit(1)
  }

  // Query embeddings: cached so every index is scored against identical vectors.
  const cache = await loadJson(CACHE_PATH, {})
  const queryVectors = {}
  for (const c of cases) {
    const key = `${model}|RETRIEVAL_QUERY|${c.query}`
    if (!cache[key]) {
      if (!process.env.GEMINI_API_KEY) {
        console.error('GEMINI_API_KEY is not set and some query embeddings are not cached yet.')
        process.exit(1)
      }
      process.stdout.write(`embedding query: ${c.id}... `)
      cache[key] = await embedQueryWithRetry(c.query)
      console.log('ok')
      // Save as we go so an interrupted run does not lose paid-for embeddings.
      await mkdir(dirname(CACHE_PATH), { recursive: true })
      await writeFile(CACHE_PATH, JSON.stringify(cache))
    }
    queryVectors[c.id] = cache[key]
  }

  const results = cases.map((c) => {
    const multi = isMultiPart(c)
    const targets = !c.answerable ? [] : multi ? c.evidence : [c]

    const ranked = chunks
      .map((chunk, index) => ({ chunk, index, score: cosineSimilarity(queryVectors[c.id], chunk.embedding) }))
      .sort((a, b) => b.score - a.score)
      .map((r, i) => {
        const matches = targets.map((t) => isRelevant(r.chunk, t))
        return { ...r, rank: i + 1, matches, relevant: matches.some(Boolean) }
      })

    const firstRelevant = ranked.find((r) => r.relevant)
    const topIncorrect = ranked.find((r) => !r.relevant)
    const topChat = ranked.slice(0, CHAT_TOP_K)

    const base = {
      id: c.id,
      query: c.query,
      language: c.language,
      answerable: c.answerable,
      category: c.category ?? (c.answerable ? 'answerable' : 'unrelated'),
      tags: c.tags ?? [],
      topScore: round(ranked[0].score, 4),
      topFile: chunkFile(ranked[0].chunk),
      topHeadingPath: ranked[0].chunk.headingPath ?? null,
      contextWordsAtChatK: topChat.reduce((sum, r) => sum + countWords(r.chunk.text), 0),
      top: ranked.slice(0, SHOW_TOP).map((r) => ({
        rank: r.rank,
        score: round(r.score, 4),
        relevant: r.relevant,
        ...(multi ? { evidence: r.matches.flatMap((m, i) => (m ? [i] : [])) } : {}),
        file: chunkFile(r.chunk),
        id: r.chunk.id ?? `legacy-${r.index}`,
        location: chunkLabel(r.chunk),
      })),
    }

    if (!c.answerable) {
      return {
        ...base,
        negativeType: negativeTypeOf(c),
        negativeTypeInferred: c.negativeType == null,
        expected: [],
        firstRelevantRank: null,
        bestRelevantScore: null,
        precisionAtChatK: null,
      }
    }

    const bestRelevantScore = firstRelevant?.score ?? null
    const topIncorrectScore = topIncorrect?.score ?? null
    const common = {
      ...base,
      firstRelevantRank: firstRelevant?.rank ?? null,
      bestRelevantScore: round(bestRelevantScore, 4),
      topIncorrectScore: round(topIncorrectScore, 4),
      margin: bestRelevantScore != null && topIncorrectScore != null ? round(bestRelevantScore - topIncorrectScore, 4) : null,
      relevantChunksInIndex: ranked.filter((r) => r.relevant).length,
      precisionAtChatK: topChat.filter((r) => r.relevant).length / topChat.length,
    }

    if (!multi) return { ...common, expected: relevanceOptions(c) }

    // Multi-part: rank of the first chunk supporting each evidence item.
    const evidence = c.evidence.map((ev, i) => {
      const hit = ranked.find((r) => r.matches[i])
      return { label: ev.label ?? `evidence ${i + 1}`, expected: relevanceOptions(ev), firstRank: hit?.rank ?? null, score: round(hit?.score ?? null, 4) }
    })
    const evRanks = evidence.map((e) => e.firstRank)
    return {
      ...common,
      multiPart: true,
      evidence,
      anyEvidenceRank: firstRelevant?.rank ?? null,
      // Smallest k at which every evidence item has appeared.
      allEvidenceRank: evRanks.every((r) => r != null) ? Math.max(...evRanks) : null,
      evidenceItemsInChatK: evRanks.filter((r) => r != null && r <= CHAT_TOP_K).length,
    }
  })

  const single = results.filter((r) => r.answerable && !r.multiPart)
  const multi = results.filter((r) => r.multiPart)
  const negatives = results.filter((r) => !r.answerable)
  const inDomain = negatives.filter((r) => r.negativeType === 'in-domain-unsupported')
  const outDomain = negatives.filter((r) => r.negativeType === 'out-of-domain')

  const metrics = {
    all: summarize(single),
    en: summarize(single.filter((r) => r.language === 'en')),
    uz: summarize(single.filter((r) => r.language === 'uz')),
  }
  const categories = [...new Set(single.map((r) => r.category))]
  const byCategory = Object.fromEntries(categories.map((cat) => [cat, summarize(single.filter((r) => r.category === cat))]))
  const multiPart = {
    all: summarizeMulti(multi),
    en: summarizeMulti(multi.filter((r) => r.language === 'en')),
    uz: summarizeMulti(multi.filter((r) => r.language === 'uz')),
  }

  const answerableBest = single.map((r) => r.bestRelevantScore)
  const answerableTop = single.map((r) => r.topScore)
  const distributions = {
    'answerable: best relevant score': distribution(answerableBest),
    'answerable: top-1 score': distribution(answerableTop),
    'answerable: top incorrect score': distribution(single.map((r) => r.topIncorrectScore)),
    'in-domain-unsupported: top-1 score': distribution(inDomain.map((r) => r.topScore)),
    'out-of-domain: top-1 score': distribution(outDomain.map((r) => r.topScore)),
  }
  const overlaps = {
    'answerable best-relevant vs in-domain-unsupported top-1': overlap(answerableBest, inDomain.map((r) => r.topScore)),
    'answerable top-1 vs in-domain-unsupported top-1': overlap(answerableTop, inDomain.map((r) => r.topScore)),
    'answerable best-relevant vs out-of-domain top-1': overlap(answerableBest, outDomain.map((r) => r.topScore)),
    'answerable top-1 vs out-of-domain top-1': overlap(answerableTop, outDomain.map((r) => r.topScore)),
  }

  const chunkWords = chunks.map((c) => countWords(c.text))
  const negScores = negatives.map((r) => r.topScore)
  const relevantBest = answerableBest.filter((s) => s != null)
  // Kept with the Phase 1 field names so compare-rag.js reads old and new files alike.
  const scoreSummary = {
    unrelatedTopScores: Object.fromEntries(negatives.map((r) => [r.id, r.topScore])),
    unrelatedTopScoreMax: negScores.length ? round(Math.max(...negScores), 4) : null,
    unrelatedTopScoreMean: round(mean(negScores), 4),
    answerableBestRelevantScoreMin: relevantBest.length ? round(Math.min(...relevantBest), 4) : null,
    answerableBestRelevantScoreMean: round(mean(relevantBest), 4),
  }

  // ---------- report ----------

  console.log(`\n=== RAG retrieval evaluation: ${label} ===`)
  console.log(`questions: ${basename(questionsPath)}${questions.split ? ` [${questions.split}]` : ''}`)
  console.log(`index: ${chunks.length} chunks, chunker=${chunker}, model=${vectors.model ?? model}`)
  console.log(
    `chunk size (words): min ${Math.min(...chunkWords)}, mean ${round(mean(chunkWords), 1)}, max ${Math.max(...chunkWords)}\n`,
  )
  console.log('Single-answer questions (multi-part excluded):')
  printTable(metrics, SINGLE_ROWS)

  if (categories.length > 1) {
    console.log('\nBy category (single-answer):')
    printTable(byCategory, SINGLE_ROWS.filter(([n]) => /questions|Hit@1|Hit@4|MRR|margin|first/.test(n)))
  }

  if (multi.length) {
    console.log('\nMulti-part questions (reported separately):')
    printTable(multiPart, [
      ['questions', (g) => g?.n ?? 0],
      ['any evidence @1', (g) => pct(g?.['anyEvidence@1'])],
      [`any evidence @${CHAT_TOP_K}`, (g) => pct(g?.[`anyEvidence@${CHAT_TOP_K}`])],
      [`all evidence @${CHAT_TOP_K} (what chat sends)`, (g) => pct(g?.[`allEvidence@${CHAT_TOP_K}`])],
      ['all evidence @5', (g) => pct(g?.['allEvidence@5'])],
      [`evidence items in top ${CHAT_TOP_K} (mean)`, (g) => fmt(g?.meanEvidenceItemsInTop4)],
    ])
    for (const r of multi) {
      console.log(`  [${r.language}] ${r.id}: ${r.evidence.map((e) => `${e.label} @${e.firstRank ?? '-'}`).join(', ')}`)
    }
  }

  console.log('\nNegative questions (top-1 chunk; recorded only, no cutoff is applied):')
  for (const r of [...inDomain, ...outDomain]) {
    console.log(
      `  ${r.topScore.toFixed(4)}  ${r.negativeType.padEnd(22)}${r.negativeTypeInferred ? '*' : ' '}[${r.language}] ${r.query}\n` +
        `          → ${r.topFile} :: ${(r.topHeadingPath ?? []).join(' > ') || r.top[0].location}`,
    )
  }
  if (negatives.some((r) => r.negativeTypeInferred)) {
    console.log('  * no negativeType in the question file; treated as out-of-domain')
  }

  console.log('\nScore distributions:')
  printDistributions(distributions)

  console.log('\nOverlap (A should score higher than B; AUC 1.0 = fully separable, 0.5 = no separation):')
  for (const [name, o] of Object.entries(overlaps)) {
    if (!o) {
      console.log(`  ${name}: not enough data`)
      continue
    }
    console.log(
      `  ${name}:\n    A min ${o.aMin}, B max ${o.bMax} → ${o.overlaps ? `OVERLAP on [${o.overlapRange.join(', ')}]` : `no overlap (gap ${o.gap})`}; ` +
        `${o.aAtOrBelowBMax}/${o.nA} A at or below B max, ${o.bAtOrAboveAMin}/${o.nB} B at or above A min; AUC ${o.auc}`,
    )
  }

  const failures = single.filter((r) => r.firstRelevantRank == null || r.firstRelevantRank > 3)
  console.log(`\nFailed single-answer questions (no relevant chunk in top 3): ${failures.length}`)
  for (const r of failures) {
    console.log(`\n✗ [${r.language}] (${r.category}) ${r.query}`)
    console.log(
      `  expected: ${r.expected.map((e) => `${e.file} ⊃ ${e.passages.map((p) => JSON.stringify(p)).join(' + ')}`).join('  OR  ')}`,
    )
    console.log(
      `  first relevant rank: ${r.firstRelevantRank ?? 'none in index'}${r.bestRelevantScore != null ? ` (score ${r.bestRelevantScore})` : ''}`,
    )
    for (const t of r.top) {
      console.log(`  ${String(t.rank).padStart(2)}. ${t.score.toFixed(4)} ${t.relevant ? '✓' : ' '} ${t.file} :: ${t.location}`)
    }
  }

  const out = {
    label,
    evaluatedAt: new Date().toISOString(),
    questionsFile: basename(questionsPath),
    questionsSplit: questions.split ?? null,
    questionsVersion: questions.version,
    questionsHash: createHash('sha256').update(JSON.stringify(cases)).digest('hex'),
    index: {
      chunker,
      model: vectors.model ?? model,
      createdAt: vectors.createdAt ?? null,
      chunkCount: chunks.length,
      chunkWords: { min: Math.min(...chunkWords), mean: round(mean(chunkWords), 1), max: Math.max(...chunkWords) },
      chunks: chunks.map((c, i) => ({
        id: c.id ?? `legacy-${i}`,
        file: chunkFile(c),
        headingPath: c.headingPath ?? null,
        words: countWords(c.text),
      })),
    },
    metrics,
    metricsByCategory: byCategory,
    multiPart,
    scores: scoreSummary,
    distributions,
    overlaps,
    negatives: negatives.map((r) => ({
      id: r.id,
      language: r.language,
      negativeType: r.negativeType,
      negativeTypeInferred: r.negativeTypeInferred,
      query: r.query,
      topScore: r.topScore,
      topFile: r.topFile,
      topHeadingPath: r.topHeadingPath,
    })),
    cases: results,
  }

  await writeFile(outPath, JSON.stringify(out, null, 2))
  console.log(`\nSaved ${outPath}`)
}

main().catch((err) => {
  console.error('\nEvaluation failed:', err.message)
  process.exit(1)
})
