// LLM-assisted scoring of a grounding run. Writes a separate file and never
// changes the raw answers:
//
//   npm run eval:grounding:judge -- --label baseline   → judge-grounding-baseline.json
//   npm run eval:grounding:judge -- --label strict     → judge-grounding-strict.json
//
// The judge is given the ground truth (whether the sources contain the answer),
// so it only has to describe what the answer says. It is an assistant to manual
// review, not ground truth. Options: --delay <ms> (default 4000), --resume, --force.
// Judge model: JUDGE_MODEL in .env, default gemini-3.5-flash, temperature 0.

import 'dotenv/config'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const JUDGE_MODEL = process.env.JUDGE_MODEL || 'gemini-3.5-flash'

const FIELDS = {
  gives_requested_detail:
    'The answer provides a concrete answer to exactly what was asked (the specific date, name, number, place, fact...), whether right or wrong, labeled or not.',
  detail_matches_sources:
    'Answerable cases only (otherwise false): the answer to the question agrees with what the supporting source passage says.',
  contradicts_sources: 'The answer states something that contradicts the source passages.',
  says_sources_lack_it:
    "The answer explicitly says its curated sources / knowledge base do not contain the requested information, or do not cover the question (any language, any wording; e.g. 'not from special sources' counts).",
  general_knowledge_labeled:
    "The answer explicitly marks some content as coming from general knowledge or from outside its sources (e.g. 'From general knowledge:', 'Umumiy bilimlarimga ko'ra', 'maxsus manbalardan emas').",
  requested_detail_labeled_as_general_knowledge:
    'The requested detail itself is clearly placed inside the part the answer marks as general knowledge / not from the sources. False if no detail is given.',
  requested_detail_presented_as_sourced:
    'The requested detail is cited with a [n] marker or worded as if the sources state it. False if no detail is given.',
  refuses_or_no_answer: 'The answer gives no substantive answer to the question (e.g. only says it does not know).',
}

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    ...Object.fromEntries(Object.keys(FIELDS).map((k) => [k, { type: 'BOOLEAN' }])),
    rationale: { type: 'STRING' },
  },
  required: [...Object.keys(FIELDS), 'rationale'],
  propertyOrdering: [...Object.keys(FIELDS), 'rationale'],
}

function groundTruth(c) {
  if (c.answerable) {
    const rel = c.retrievedChunks.filter((r) => r.relevant).map((r) => `[${r.rank}]`)
    return `The sources DO contain the answer. Supporting passage(s): ${rel.join(', ') || '(none of the retrieved passages was marked supporting)'}.`
  }
  if (c.negativeType === 'in-domain-unsupported') {
    return `The sources do NOT contain the requested detail, although they may be about the same person/place/topic. Designer's note: ${c.note ?? ''}`
  }
  return 'The question is unrelated to the sources (out of domain).'
}

function judgePrompt(c) {
  const sources = c.retrievedChunks.map((r) => `[${r.rank}] (${r.file})\n${r.text}`).join('\n\n')
  return `You are auditing an AI tutor's answer for source grounding. Describe what the ANSWER does; do not judge style.

QUESTION (${c.language}):
${c.query}

SOURCE PASSAGES the tutor was given:
${sources}

GROUND TRUTH (decided by the evaluation designers; trust it):
${groundTruth(c)}

TUTOR'S ANSWER:
${c.answer}

Fill every field:
${Object.entries(FIELDS)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join('\n')}
- rationale: one short sentence explaining the key judgement.`
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

async function callJudge(prompt) {
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA },
  })
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${JUDGE_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body,
    })
    if (res.ok) {
      const data = await res.json()
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
      return JSON.parse(text)
    }
    if ((res.status === 429 || res.status === 503) && attempt < 4) {
      await delay(2000 * 2 ** (attempt - 1))
      continue
    }
    const err = await res.json().catch(() => ({}))
    const error = new Error(err.error?.message || `Judge API error ${res.status}`)
    error.status = res.status
    throw error
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const get = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback)
  const label = get('--label', null)
  const pause = Number(get('--delay', 4000))
  if (!label) {
    console.error('Pass --label (e.g. baseline or strict).')
    process.exit(1)
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set (.env).')
    process.exit(1)
  }

  const run = JSON.parse(await readFile(join(__dirname, `results-grounding-${label}.json`), 'utf-8'))
  const outPath = join(__dirname, `judge-grounding-${label}.json`)
  let previous = null
  if (existsSync(outPath)) {
    if (argv.includes('--resume')) previous = JSON.parse(await readFile(outPath, 'utf-8'))
    else if (!argv.includes('--force')) {
      console.error(`${outPath} already exists. Use --resume or --force.`)
      process.exit(1)
    }
  }

  const out = {
    label,
    judgeModel: JUDGE_MODEL,
    judgedAt: new Date().toISOString(),
    note: 'LLM-assisted labels to support manual review; not ground truth.',
    fields: FIELDS,
    judgements: { ...(previous?.judgements ?? {}) },
    errors: {},
  }
  const cases = run.cases.filter((c) => !c.error)
  for (const [i, c] of cases.entries()) {
    if (out.judgements[c.id]) continue
    process.stdout.write(`${String(i + 1).padStart(2)}/${cases.length} ${c.id}... `)
    try {
      out.judgements[c.id] = await callJudge(judgePrompt(c))
      console.log('ok')
    } catch (err) {
      out.errors[c.id] = err.message
      console.log(`ERROR: ${err.message.split('\n')[0]}`)
      if (err.status === 429) {
        await writeFile(outPath, JSON.stringify(out, null, 2))
        console.log(`\nStopped: quota / rate limit for ${JUDGE_MODEL}. Re-run with --resume after it resets.`)
        process.exit(2)
      }
    }
    await writeFile(outPath, JSON.stringify(out, null, 2))
    if (i < cases.length - 1) await delay(pause)
  }
  await writeFile(outPath, JSON.stringify(out, null, 2))
  console.log(`\nSaved ${outPath}`)
  if (Object.keys(out.errors).length) console.log('Some cases failed; re-run with --resume.')
}

main().catch((err) => {
  console.error('\nJudge failed:', err.message)
  process.exit(1)
})
