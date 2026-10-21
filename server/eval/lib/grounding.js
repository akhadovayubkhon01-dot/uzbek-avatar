// Deterministic checks and metric definitions for the grounding evaluation.
// The checks are coarse string signals meant to assist manual review; they are
// not ground truth.

import { normalize } from './relevance.js'

// [1], [2] ... as instructed by the strict prompt. Only 1..chunkCount count.
export function parseCitations(answer, chunkCount) {
  const found = new Set()
  for (const m of answer.matchAll(/\[(\d+)\]/g)) {
    const n = Number(m[1])
    if (n >= 1 && n <= chunkCount) found.add(n)
  }
  return [...found].sort((a, b) => a - b)
}

// The exact labels the strict prompt asks for.
const STRICT_GK_LABEL = /from general knowledge|umumiy bilimlarimga ko'ra|umumiy bilimlarim/

// Any explicit "this is not from my sources" marker, including the wording the
// baseline prompt asks for ("maxsus manbalardan emas").
const OUTSIDE_SOURCES_LABEL =
  /from general knowledge|general knowledge|not from (my|the) (curated |special )?(sources|knowledge base)|outside (my|the) (curated )?(sources|knowledge base)|umumiy bilim|manbalar\w* ?emas|manbalardan tashqari|maxsus manbalarda emas/

// "My sources don't contain / don't cover this" (heuristic, both languages).
const SOURCES_LACK = [
  /(sources?|knowledge base|materials?)[^.!?\n]{0,120}\b(do not|don't|does not|doesn't|did not|didn't|not)\b[^.!?\n]{0,40}\b(contain|include|mention|cover|say|state|provide|specify|give|have|address)/,
  /\bno (information|mention|details?)\b[^.!?\n]{0,80}\b(sources?|knowledge base)/,
  /(sources?|knowledge base)[^.!?\n]{0,60}\b(lack|silent)/,
  /manba\w*[^.!?\n]{0,140}(yo'q|keltirilmagan|aytilmagan|qamrab olmaydi|qamrab olmagan|mavjud emas|ko'rsatilmagan|uchramaydi|berilmagan|yozilmagan|eslatilmagan|tilga olinmagan)/,
  /bilim bazam\w*[^.!?\n]{0,120}(yo'q|qamrab olmaydi|mavjud emas|kiritilmagan)/,
]

export function ruleChecks(answer, { chunks, answerable, answerKeys, detailKeys }) {
  const text = normalize(answer)
  const cited = parseCitations(answer, chunks.length)
  const relevantIdx = chunks.filter((c) => c.relevant).map((c) => c.rank)
  const out = {
    words: answer.split(/\s+/).filter(Boolean).length,
    citations: cited,
    hasCitation: cited.length > 0,
    strictGeneralKnowledgeLabel: STRICT_GK_LABEL.test(text),
    outsideSourcesLabel: OUTSIDE_SOURCES_LABEL.test(text),
    saysSourcesLackIt: SOURCES_LACK.some((re) => re.test(text)),
  }
  if (answerable) {
    out.answerKeysHit = answerKeys ? answerKeys.every((group) => group.some((k) => text.includes(normalize(k)))) : null
    out.citesSupportingChunk = cited.some((n) => relevantIdx.includes(n))
    out.allCitedChunksSupport = cited.length > 0 && cited.every((n) => relevantIdx.includes(n))
  } else {
    out.detailKeysHit = detailKeys ? detailKeys.some((k) => text.includes(normalize(k))) : null
  }
  return out
}

const rate = (xs, fn) => (xs.length ? { n: xs.length, k: xs.filter(fn).length, rate: xs.filter(fn).length / xs.length } : { n: 0, k: 0, rate: null })

// Metrics from the LLM judge (when present) and from the deterministic checks.
export function groundingMetrics(cases, judgeById = {}) {
  const ok = cases.filter((c) => !c.error)
  const ans = ok.filter((c) => c.answerable)
  const indom = ok.filter((c) => c.negativeType === 'in-domain-unsupported')
  const ood = ok.filter((c) => c.negativeType === 'out-of-domain')
  const J = (c) => judgeById[c.id]
  const hasJudge = ok.some((c) => J(c))
  const jAns = ans.filter(J)
  const jIn = indom.filter(J)
  const jOod = ood.filter(J)

  const judged = hasJudge
    ? {
        answerable: {
          usefulAnswer: rate(jAns, (c) => J(c).gives_requested_detail && J(c).detail_matches_sources),
          supportedByEvidence: rate(jAns, (c) => J(c).detail_matches_sources && !J(c).contradicts_sources),
          unnecessaryRefusal: rate(jAns, (c) => J(c).says_sources_lack_it || J(c).refuses_or_no_answer),
        },
        inDomainUnsupported: {
          recognizedNotInSources: rate(jIn, (c) => J(c).says_sources_lack_it),
          unsupportedDetailHallucination: rate(
            jIn,
            (c) =>
              J(c).gives_requested_detail &&
              (!J(c).requested_detail_labeled_as_general_knowledge || J(c).requested_detail_presented_as_sourced),
          ),
          labeledGeneralKnowledgeFallback: rate(
            jIn,
            (c) =>
              J(c).gives_requested_detail &&
              J(c).requested_detail_labeled_as_general_knowledge &&
              !J(c).requested_detail_presented_as_sourced,
          ),
          abstainedWithoutDetail: rate(jIn, (c) => J(c).says_sources_lack_it && !J(c).gives_requested_detail),
        },
        outOfDomain: {
          recognizedUnrelated: rate(jOod, (c) => J(c).says_sources_lack_it),
          answeredWithLabel: rate(jOod, (c) => J(c).gives_requested_detail && J(c).general_knowledge_labeled),
        },
      }
    : null

  const R = (c) => c.rules
  const rules = {
    answerable: {
      answerKeysHit: rate(ans.filter((c) => R(c).answerKeysHit != null), (c) => R(c).answerKeysHit),
      citesSupportingChunk: rate(ans, (c) => R(c).citesSupportingChunk),
      allCitedChunksSupport: rate(ans, (c) => R(c).allCitedChunksSupport),
      anyCitation: rate(ans, (c) => R(c).hasCitation),
      saysSourcesLackIt: rate(ans, (c) => R(c).saysSourcesLackIt),
    },
    inDomainUnsupported: {
      saysSourcesLackIt: rate(indom, (c) => R(c).saysSourcesLackIt),
      outsideSourcesLabel: rate(indom, (c) => R(c).outsideSourcesLabel),
      strictGeneralKnowledgeLabel: rate(indom, (c) => R(c).strictGeneralKnowledgeLabel),
      detailKeysHit: rate(indom.filter((c) => R(c).detailKeysHit != null), (c) => R(c).detailKeysHit),
      detailKeysHitWithoutLabel: rate(
        indom.filter((c) => R(c).detailKeysHit != null),
        (c) => R(c).detailKeysHit && !R(c).outsideSourcesLabel,
      ),
      anyCitation: rate(indom, (c) => R(c).hasCitation),
    },
    outOfDomain: {
      saysSourcesLackIt: rate(ood, (c) => R(c).saysSourcesLackIt),
      outsideSourcesLabel: rate(ood, (c) => R(c).outsideSourcesLabel),
      anyCitation: rate(ood, (c) => R(c).hasCitation),
    },
  }

  return { counts: { total: cases.length, errors: cases.length - ok.length, answerable: ans.length, inDomain: indom.length, outOfDomain: ood.length, judged: ok.filter(J).length }, judged, rules }
}

function pctl(sorted, p) {
  if (!sorted.length) return null
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

export function costStats(cases) {
  const ok = cases.filter((c) => !c.error)
  const stat = (vals) => {
    const xs = vals.filter((v) => v != null).sort((a, b) => a - b)
    if (!xs.length) return null
    return {
      n: xs.length,
      mean: Math.round(xs.reduce((s, x) => s + x, 0) / xs.length),
      median: Math.round(pctl(xs, 0.5)),
      p90: Math.round(pctl(xs, 0.9)),
      max: Math.round(xs[xs.length - 1]),
    }
  }
  return {
    latencyMs: stat(ok.map((c) => c.latencyMs)),
    promptTokens: stat(ok.map((c) => c.usage?.promptTokenCount)),
    outputTokens: stat(ok.map((c) => c.usage?.candidatesTokenCount)),
    totalTokens: stat(ok.map((c) => c.usage?.totalTokenCount)),
    systemPromptChars: stat(ok.map((c) => c.systemPromptChars)),
    answerWords: stat(ok.map((c) => c.rules?.words)),
    modelCounts: ok.reduce((acc, c) => ({ ...acc, [c.model ?? 'unknown']: (acc[c.model ?? 'unknown'] ?? 0) + 1 }), {}),
    truncated: ok.filter((c) => c.finishReason === 'MAX_TOKENS').map((c) => c.id),
  }
}
