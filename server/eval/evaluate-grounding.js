// Grounding evaluation: does the chat model answer from the retrieved sources,
// say when the sources lack the requested detail, and label general knowledge?
//
//   npm run eval:grounding -- --grounding both       paired: baseline and strict per question
//   npm run eval:grounding -- --grounding baseline   → results-grounding-baseline.json
//   npm run eval:grounding -- --grounding strict     → results-grounding-strict.json
//
// Options:
//   --resume         continue existing result files (skips answers already saved)
//   --order priority in-domain-unsupported first, then out-of-domain, then answerable (default)
//   --order file     question-file order
//   --delay <ms>     pause between calls (default 4000)
//   --only id1,id2   restrict to some questions
//   --label <name>   with a single mode only: results-grounding-<name>.json
//   --force          overwrite existing result files
//
// Every case goes through generateChatAnswer() in server/chat.js — the same
// retrieval (top 4), system prompt and Gemini settings as the live chat — with
// two differences: the query embedding comes from the cache shared with
// evaluate-rag.js (so retrieval is identical to the Phase 2 run), and the
// fallback model is disabled, so every answer comes from the same model. When
// the API quota runs out the run stops and can be continued with --resume.
// Multi-part cases are skipped.
//
// Raw answers are saved in full for manual review. The rule-based checks stored
// next to them are coarse signals, not ground truth.

import 'dotenv/config'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { embedText, getEmbedModel } from '../lib/embeddings.js'
import { GROUNDING_MODES, generateChatAnswer } from '../chat.js'
import { chunkFile, isRelevant } from './lib/relevance.js'
import { ruleChecks } from './lib/grounding.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CACHE_PATH = join(__dirname, '.cache', 'query-embeddings.json')
const CHECKS_PATH = join(__dirname, 'grounding-checks.json')
const TEACHER_NAME = 'Asilbek'
const PRIORITY = { 'in-domain-unsupported': 0, 'out-of-domain': 1, answerable: 2 }

function parseArgs(argv) {
  const args = { grounding: null, label: null, questions: 'rag-questions-hard.json', delay: 4000, only: null, resume: false, force: false, order: 'priority' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--grounding') args.grounding = argv[++i]
    else if (a === '--label') args.label = argv[++i]
    else if (a === '--questions') args.questions = argv[++i]
    else if (a === '--delay') args.delay = Number(argv[++i])
    else if (a === '--only') args.only = argv[++i].split(',').map((s) => s.trim())
    else if (a === '--order') args.order = argv[++i]
    else if (a === '--resume') args.resume = true
    else if (a === '--force') args.force = true
  }
  return args
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

async function loadJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf-8'))
  } catch {
    return fallback
  }
}

// chat.js logs every retrieval and retry; keep the evaluation output readable.
async function quietly(fn) {
  const { log, warn, error } = console
  console.log = () => {}
  console.warn = () => {}
  console.error = () => {}
  try {
    return await fn()
  } finally {
    Object.assign(console, { log, warn, error })
  }
}

const caseType = (c) => (c.answerable ? 'answerable' : (c.negativeType ?? 'out-of-domain'))

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const modes = args.grounding === 'both' ? ['baseline', 'strict'] : [args.grounding]
  if (!modes.every((m) => GROUNDING_MODES.includes(m))) {
    console.error(`Pass --grounding baseline, strict or both.`)
    process.exit(1)
  }
  if (args.label && modes.length > 1) {
    console.error('--label works with a single --grounding mode only.')
    process.exit(1)
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set (.env).')
    process.exit(1)
  }

  const questionsPath = isAbsolute(args.questions) ? args.questions : join(__dirname, args.questions)
  const questions = JSON.parse(await readFile(questionsPath, 'utf-8'))
  const checks = JSON.parse(await readFile(CHECKS_PATH, 'utf-8'))
  const questionsHash = createHash('sha256').update(JSON.stringify(questions.cases)).digest('hex')

  const fileOrder = questions.cases.filter(
    (c) => !(c.answerable && Array.isArray(c.evidence)) && (!args.only || args.only.includes(c.id)),
  )
  const selected =
    args.order === 'file'
      ? fileOrder
      : [...fileOrder].sort((a, b) => PRIORITY[caseType(a)] - PRIORITY[caseType(b)])

  // One result file per mode. Answers are stored keyed by id and written in
  // question-file order, so the files stay comparable whatever the run order.
  const runs = {}
  for (const mode of modes) {
    const label = args.label ?? mode
    const path = join(__dirname, `results-grounding-${label}.json`)
    let previous = null
    if (existsSync(path)) {
      if (args.resume) previous = JSON.parse(await readFile(path, 'utf-8'))
      else if (!args.force) {
        console.error(`${path} already exists. Use --resume to continue it, or --force to overwrite.`)
        process.exit(1)
      }
    }
    if (previous && previous.questionsHash !== questionsHash) {
      console.error(`${path} was made with a different question file; use a new --label or --force.`)
      process.exit(1)
    }
    runs[mode] = {
      path,
      byId: new Map((previous?.cases ?? []).filter((c) => !c.error).map((c) => [c.id, c])),
      errors: new Map(),
      meta: {
        label,
        grounding: mode,
        startedAt: previous?.startedAt ?? previous?.evaluatedAt ?? new Date().toISOString(),
        questionsFile: basename(questionsPath),
        questionsSplit: questions.split ?? null,
        questionsHash,
        conversationLanguage: 'same as the question language',
        teacherName: TEACHER_NAME,
        chatModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
        fallbackModel: 'disabled for evaluation',
        systemPromptSample: previous?.systemPromptSample ?? null,
      },
    }
  }

  const save = async (run) => {
    const cases = fileOrder.map((c) => run.byId.get(c.id) ?? (run.errors.has(c.id) ? run.errors.get(c.id) : null)).filter(Boolean)
    const complete = fileOrder.every((c) => run.byId.has(c.id))
    await writeFile(
      run.path,
      JSON.stringify({ ...run.meta, updatedAt: new Date().toISOString(), complete, answered: run.byId.size, selected: fileOrder.length, cases }, null, 2),
    )
  }

  const model = getEmbedModel()
  const cache = await loadJson(CACHE_PATH, {})
  const todo = selected.flatMap((c) => modes.filter((m) => !runs[m].byId.has(c.id)).map((m) => [c, m]))

  console.log(
    `Grounding evaluation: ${modes.join(' + ')}, ${selected.length} questions, ${todo.length} answer(s) still to generate` +
      ` (order: ${args.order}; fallback model disabled)\n`,
  )

  let stoppedForQuota = null
  for (const [i, [c, mode]] of todo.entries()) {
    const run = runs[mode]
    const key = `${model}|RETRIEVAL_QUERY|${c.query}`
    if (!cache[key]) {
      cache[key] = await embedText(c.query, 'RETRIEVAL_QUERY')
      await mkdir(dirname(CACHE_PATH), { recursive: true })
      await writeFile(CACHE_PATH, JSON.stringify(cache))
    }

    process.stdout.write(`${String(i + 1).padStart(3)}/${todo.length} ${mode.padEnd(8)} ${c.id}... `)
    const base = {
      id: c.id,
      query: c.query,
      language: c.language,
      category: c.category ?? null,
      answerable: Boolean(c.answerable),
      negativeType: c.answerable ? null : (c.negativeType ?? 'out-of-domain'),
      note: c.note ?? null,
    }

    try {
      const res = await quietly(() =>
        generateChatAnswer([{ role: 'user', content: c.query }], {
          language: c.language,
          teacherName: TEACHER_NAME,
          grounding: mode,
          queryEmbedding: cache[key],
          allowFallback: false,
        }),
      )
      const retrievedChunks = res.chunks.map((chunk, idx) => ({
        rank: idx + 1,
        id: chunk.id,
        file: chunkFile(chunk),
        headingPath: chunk.headingPath,
        score: Number(chunk.score.toFixed(4)),
        relevant: c.answerable ? isRelevant(chunk, c) : false,
        text: chunk.text,
      }))
      const record = {
        ...base,
        retrievedChunks,
        answer: res.text,
        model: res.model,
        finishReason: res.finishReason,
        latencyMs: res.latencyMs,
        usage: res.usage,
        systemPromptChars: res.system.length,
        answeredAt: new Date().toISOString(),
      }
      record.rules = ruleChecks(res.text, {
        chunks: retrievedChunks,
        answerable: record.answerable,
        answerKeys: checks.answerKeys[c.id] ?? null,
        detailKeys: checks.detailKeys[c.id] ?? null,
      })
      run.meta.systemPromptSample ??= { caseId: c.id, language: c.language, text: res.system }
      run.byId.set(c.id, record)
      run.errors.delete(c.id)
      console.log(`ok (${res.latencyMs} ms)`)
    } catch (err) {
      run.errors.set(c.id, { ...base, error: err.message, errorStatus: err.status ?? null, errorModel: err.model ?? null })
      console.log(`ERROR ${err.status ?? ''} ${err.message.split('\n')[0]}`)
      if (err.status === 429) {
        stoppedForQuota = err.message
        await save(run)
        break
      }
    }

    await save(run)
    if (i < todo.length - 1) await delay(args.delay)
  }

  for (const run of Object.values(runs)) await save(run)

  console.log('')
  for (const [mode, run] of Object.entries(runs)) {
    console.log(`${mode}: ${run.byId.size}/${fileOrder.length} answered → ${run.path}`)
  }
  if (stoppedForQuota) {
    console.log(
      '\nStopped: the Gemini API returned 429 (rate limit / quota) even after retries.\n' +
        `${stoppedForQuota.split('\n').slice(0, 3).join('\n')}\n` +
        'Nothing is lost. When the quota resets, run the same command with --resume.',
    )
    process.exit(2)
  }
}

main().catch((err) => {
  console.error('\nGrounding evaluation failed:', err.message)
  process.exit(1)
})
