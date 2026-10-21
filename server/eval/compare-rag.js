// Compares two saved evaluation runs.
//
//   npm run eval:rag:compare
//   npm run eval:rag:compare -- results-heading-aware.json results-heading-aware-uz-structured.json
//
// Both files should come from the same question set (the script warns if not).
// Multi-part questions, if any, are left out of the single-answer comparison.

import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const [aArg = 'results-baseline.json', bArg = 'results-heading-aware.json'] = process.argv.slice(2)
const resolve = (p) => (isAbsolute(p) ? p : join(__dirname, p))

const CLOSE_CALL_MARGIN = 0.02

const pct = (x) => (x == null ? '-' : `${(x * 100).toFixed(1)}%`)
const num = (x) => (x == null ? '-' : String(x))
const round = (x, d = 3) => (x == null || Number.isNaN(x) ? null : Number(x.toFixed(d)))
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)
const delta = (a, b, asPct) => {
  if (a == null || b == null) return ''
  const d = b - a
  if (Math.abs(d) < 1e-9) return '='
  const s = asPct ? `${(d * 100).toFixed(1)} pts` : d.toFixed(3)
  return d > 0 ? `+${s}` : s
}

const singleAnswer = (run) => run.cases.filter((c) => c.answerable && !c.multiPart)

// Older result files have no topIncorrectScore; there the best wrong chunk is the
// first non-relevant entry of the saved top 5 (always present in practice).
function topIncorrect(c) {
  if (c.topIncorrectScore !== undefined) return c.topIncorrectScore
  return c.top.find((t) => !t.relevant)?.score ?? null
}

function marginStats(run) {
  const cases = singleAnswer(run)
  const incorrect = cases.map(topIncorrect).filter((s) => s != null)
  const margins = cases
    .map((c) => (c.bestRelevantScore != null && topIncorrect(c) != null ? c.bestRelevantScore - topIncorrect(c) : null))
    .filter((m) => m != null)
  return {
    meanTopIncorrect: round(mean(incorrect)),
    meanMargin: round(mean(margins)),
    closeCalls: margins.filter((m) => m >= 0 && m < CLOSE_CALL_MARGIN).length,
    wrongFirst: margins.filter((m) => m < 0).length,
  }
}

async function main() {
  const a = JSON.parse(await readFile(resolve(aArg), 'utf-8'))
  const b = JSON.parse(await readFile(resolve(bArg), 'utf-8'))

  if (a.questionsHash !== b.questionsHash) {
    console.warn('WARNING: the two runs used different question sets; the comparison is not like-for-like.\n')
  }

  const rows = [
    ['Hit@1', 'all', 'hit@1', true],
    ['Hit@3', 'all', 'hit@3', true],
    ['Hit@4 (what chat sends)', 'all', 'hit@4', true],
    ['Hit@5', 'all', 'hit@5', true],
    ['MRR', 'all', 'mrr', false],
    ['Avg rank of 1st relevant', 'all', 'avgFirstRelevantRank', false],
    ['English Hit@1', 'en', 'hit@1', true],
    ['Uzbek Hit@1', 'uz', 'hit@1', true],
    ['English Hit@3', 'en', 'hit@3', true],
    ['Uzbek Hit@3', 'uz', 'hit@3', true],
    ['English MRR', 'en', 'mrr', false],
    ['Uzbek MRR', 'uz', 'mrr', false],
    ['Precision@4', 'all', 'precision@4', true],
    ['Words sent to chat (top 4)', 'all', 'contextWords@4', false],
    ['Mean best relevant score', 'all', 'meanBestRelevantScore', false],
  ]

  const w = [30, 14, 14, 12]
  const line = (...cells) => console.log(cells.map((c, i) => String(c).padEnd(w[i])).join(''))
  line('Metric', a.label, b.label, 'Change')
  line('-'.repeat(28), '-'.repeat(12), '-'.repeat(12), '-'.repeat(10))
  line('Chunks in index', a.index.chunkCount, b.index.chunkCount, '')
  line('Mean chunk words', a.index.chunkWords.mean, b.index.chunkWords.mean, '')
  for (const [name, group, key, asPct] of rows) {
    const va = a.metrics[group]?.[key]
    const vb = b.metrics[group]?.[key]
    line(name, asPct ? pct(va) : num(va), asPct ? pct(vb) : num(vb), delta(va, vb, asPct))
  }
  const ma = marginStats(a)
  const mb = marginStats(b)
  line('Mean top incorrect score', num(ma.meanTopIncorrect), num(mb.meanTopIncorrect), delta(ma.meanTopIncorrect, mb.meanTopIncorrect))
  line('Mean margin (rel - incorrect)', num(ma.meanMargin), num(mb.meanMargin), delta(ma.meanMargin, mb.meanMargin))
  line(`Close calls (0 <= margin < ${CLOSE_CALL_MARGIN})`, ma.closeCalls, mb.closeCalls, delta(ma.closeCalls, mb.closeCalls))
  line('Wrong chunk ranked first', ma.wrongFirst, mb.wrongFirst, delta(ma.wrongFirst, mb.wrongFirst))

  // Per question: compare the rank of the first relevant chunk (lower is better).
  const byId = Object.fromEntries(a.cases.map((c) => [c.id, c]))
  const improved = []
  const worsened = []
  const same = []
  for (const cb of singleAnswer(b)) {
    const ca = byId[cb.id]
    if (!ca) continue
    const ra = ca.firstRelevantRank ?? Infinity
    const rb = cb.firstRelevantRank ?? Infinity
    const entry =
      `[${cb.language}] ${cb.id}: rank ${ca.firstRelevantRank ?? 'none'} → ${cb.firstRelevantRank ?? 'none'}` +
      ` (score ${num(ca.bestRelevantScore)} → ${num(cb.bestRelevantScore)})`
    if (rb < ra) improved.push(entry)
    else if (rb > ra) worsened.push(entry)
    else same.push(entry)
  }

  const list = (title, items) => {
    console.log(`\n${title} (${items.length})`)
    for (const i of items) console.log(`  ${i}`)
  }
  list('Improved', improved)
  list('Worsened', worsened)
  list('Same rank', same)

  console.log('\nNegative / unrelated questions, top similarity score and top file (recorded only):')
  for (const cb of b.cases.filter((c) => !c.answerable)) {
    const ca = byId[cb.id]
    const fileA = ca?.topFile ?? ca?.top?.[0]?.file ?? '-'
    const fileB = cb.topFile ?? cb.top?.[0]?.file ?? '-'
    console.log(`  ${cb.id.padEnd(28)} ${num(ca?.topScore).padEnd(8)} → ${num(cb.topScore).padEnd(8)} ${fileA} → ${fileB}`)
  }
}

main().catch((err) => {
  console.error('Compare failed:', err.message)
  process.exit(1)
})
