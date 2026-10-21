// Compares two grounding runs (default: baseline vs strict).
//
//   npm run eval:grounding:compare
//   npm run eval:grounding:compare -- baseline strict
//
// Uses judge-grounding-<label>.json when present (LLM-assisted, not ground
// truth) and always shows the deterministic rule checks. Prints every
// in-domain-unsupported answer from both runs for manual review, and writes the
// numbers to compare-grounding-<a>-vs-<b>.json.

import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { costStats, groundingMetrics } from './lib/grounding.js'
import { ruleChecks } from './lib/grounding.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const [aLabel = 'baseline', bLabel = 'strict'] = process.argv.slice(2)

async function load(label) {
  const run = JSON.parse(await readFile(join(__dirname, `results-grounding-${label}.json`), 'utf-8'))
  const checks = JSON.parse(await readFile(join(__dirname, 'grounding-checks.json'), 'utf-8'))
  // Recompute the rule checks so improvements to the rules apply to old runs too.
  for (const c of run.cases.filter((x) => !x.error)) {
    c.rules = ruleChecks(c.answer, {
      chunks: c.retrievedChunks,
      answerable: c.answerable,
      answerKeys: checks.answerKeys[c.id] ?? null,
      detailKeys: checks.detailKeys[c.id] ?? null,
    })
  }
  const judgePath = join(__dirname, `judge-grounding-${label}.json`)
  const judge = existsSync(judgePath) ? JSON.parse(await readFile(judgePath, 'utf-8')) : null
  return { run, judge: judge?.judgements ?? {}, hasJudge: Boolean(judge) }
}

const fmtRate = (r) => (r?.rate == null ? '-' : `${(r.rate * 100).toFixed(0)}% (${r.k}/${r.n})`)

async function main() {
  const A = await load(aLabel)
  const B = await load(bLabel)
  if (A.run.questionsHash !== B.run.questionsHash) console.warn('WARNING: different question files.\n')
  for (const [l, x] of [[aLabel, A], [bLabel, B]]) {
    if (!x.run.complete) console.warn(`WARNING: run "${l}" is incomplete or has errors.`)
    if (!x.hasJudge) console.warn(`NOTE: no judge file for "${l}"; judged metrics will show "-".`)
  }

  const mA = groundingMetrics(A.run.cases, A.judge)
  const mB = groundingMetrics(B.run.cases, B.judge)
  const cA = costStats(A.run.cases)
  const cB = costStats(B.run.cases)

  const w = [60, 24, 24]
  const line = (...cells) => console.log(cells.map((c, i) => String(c).padEnd(w[i])).join(''))
  const section = (t) => console.log(`\n${t}`)
  line('', aLabel, bLabel)

  const rowsJ = [
    ['Answerable: useful answer', 'answerable', 'usefulAnswer'],
    ['Answerable: answer supported by retrieved evidence', 'answerable', 'supportedByEvidence'],
    ['Answerable: unnecessary refusal', 'answerable', 'unnecessaryRefusal'],
    ['In-domain unsupported: recognized "not in sources"', 'inDomainUnsupported', 'recognizedNotInSources'],
    ['In-domain unsupported: unsupported-detail hallucination', 'inDomainUnsupported', 'unsupportedDetailHallucination'],
    ['In-domain unsupported: labeled general-knowledge fallback', 'inDomainUnsupported', 'labeledGeneralKnowledgeFallback'],
    ['In-domain unsupported: abstained, no detail given', 'inDomainUnsupported', 'abstainedWithoutDetail'],
    ['Out-of-domain: recognized sources unrelated', 'outOfDomain', 'recognizedUnrelated'],
    ['Out-of-domain: answered with a general-knowledge label', 'outOfDomain', 'answeredWithLabel'],
  ]
  section('LLM-assisted (judge) metrics — verify by reading the answers:')
  for (const [name, g, k] of rowsJ) line(name, fmtRate(mA.judged?.[g]?.[k]), fmtRate(mB.judged?.[g]?.[k]))

  const rowsR = [
    ['Answerable: answer contains expected key', 'answerable', 'answerKeysHit'],
    ['Answerable: cites a supporting chunk [n]', 'answerable', 'citesSupportingChunk'],
    ['Answerable: every cited chunk supports (citation precision)', 'answerable', 'allCitedChunksSupport'],
    ['Answerable: says sources lack it (heuristic)', 'answerable', 'saysSourcesLackIt'],
    ['In-domain: says sources lack it (heuristic)', 'inDomainUnsupported', 'saysSourcesLackIt'],
    ['In-domain: any outside-sources label', 'inDomainUnsupported', 'outsideSourcesLabel'],
    ['In-domain: exact "From general knowledge" label', 'inDomainUnsupported', 'strictGeneralKnowledgeLabel'],
    ['In-domain: known detail string present', 'inDomainUnsupported', 'detailKeysHit'],
    ['In-domain: detail string present, no label', 'inDomainUnsupported', 'detailKeysHitWithoutLabel'],
    ['In-domain: any [n] citation', 'inDomainUnsupported', 'anyCitation'],
    ['Out-of-domain: says sources lack it (heuristic)', 'outOfDomain', 'saysSourcesLackIt'],
    ['Out-of-domain: any [n] citation', 'outOfDomain', 'anyCitation'],
  ]
  section('Deterministic rule checks (coarse signals):')
  for (const [name, g, k] of rowsR) line(name, fmtRate(mA.rules[g][k]), fmtRate(mB.rules[g][k]))

  section('Cost per answer (generation call only; retrieval is identical):')
  const cost = (name, key) =>
    line(name, cA[key] ? `${cA[key].mean} / ${cA[key].median} / ${cA[key].p90}` : '-', cB[key] ? `${cB[key].mean} / ${cB[key].median} / ${cB[key].p90}` : '-')
  line('(mean / median / p90)', '', '')
  cost('Latency (ms)', 'latencyMs')
  cost('Prompt tokens', 'promptTokens')
  cost('Output tokens', 'outputTokens')
  cost('System prompt (characters)', 'systemPromptChars')
  cost('Answer length (words)', 'answerWords')
  line('Answering models', JSON.stringify(cA.modelCounts), JSON.stringify(cB.modelCounts))
  line('Truncated (MAX_TOKENS)', cA.truncated.length, cB.truncated.length)

  section('In-domain unsupported — every answer from both runs (manual review):')
  const byIdB = Object.fromEntries(B.run.cases.map((c) => [c.id, c]))
  for (const ca of A.run.cases.filter((c) => c.negativeType === 'in-domain-unsupported')) {
    const cb = byIdB[ca.id]
    console.log(`\n■ [${ca.language}] ${ca.id}: ${ca.query}`)
    console.log(`  top source: ${ca.retrievedChunks?.[0]?.file} :: ${(ca.retrievedChunks?.[0]?.headingPath ?? []).join(' > ')}`)
    for (const [l, c, J] of [[aLabel, ca, A.judge], [bLabel, cb, B.judge]]) {
      if (!c || c.error) {
        console.log(`  ${l}: (no answer${c?.error ? `: ${c.error}` : ''})`)
        continue
      }
      const j = J[c.id]
      const verdict = j
        ? j.gives_requested_detail && (!j.requested_detail_labeled_as_general_knowledge || j.requested_detail_presented_as_sourced)
          ? 'HALLUCINATION'
          : j.says_sources_lack_it
            ? 'recognized'
            : 'not recognized'
        : 'not judged'
      console.log(`  ${l} [${verdict}]: ${c.answer.replace(/\s+/g, ' ').trim()}`)
      if (j) console.log(`      judge: ${j.rationale}`)
    }
  }

  const outPath = join(__dirname, `compare-grounding-${aLabel}-vs-${bLabel}.json`)
  await writeFile(outPath, JSON.stringify({ a: aLabel, b: bLabel, metrics: { [aLabel]: mA, [bLabel]: mB }, cost: { [aLabel]: cA, [bLabel]: cB } }, null, 2))
  console.log(`\nSaved ${outPath}`)
}

main().catch((err) => {
  console.error('Compare failed:', err.message)
  process.exit(1)
})
