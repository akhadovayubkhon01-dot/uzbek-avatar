// Real-time lip-sync driven by the audio signal itself rather than by phonemes.
// The TTS service returns plain audio with no phoneme timings, so we analyse the
// spectrum each frame: loudness drives how far the mouth opens, and the spectral
// centroid (whether energy sits in low or high frequencies) decides whether the
// shape is round like "o" or wide like "i". This is language-agnostic, which is
// what makes it work for Uzbek.

const FFT_SIZE = 1024
// Speech energy lives roughly in this range; ignoring the rest keeps the
// centroid from being dragged around by hiss and rumble.
const MIN_FREQ = 85
const MAX_FREQ = 5000

// Below this normalised loudness we treat the signal as silence and close the mouth.
const SILENCE_THRESHOLD = 0.06

let audioContext = null
let analyser = null
let frequencyData = null
let connectedElements = new WeakSet()
let active = false

function getAudioContext() {
  if (!audioContext) {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return null
    audioContext = new Ctx()
  }
  return audioContext
}

/**
 * Routes a playing <audio> element through an analyser so the avatar can read it.
 * Safe to call once per element — the Web Audio API only allows a single
 * MediaElementSource per element, so repeat calls are ignored.
 */
export function attachAudio(audioElement) {
  const ctx = getAudioContext()
  if (!ctx || !audioElement) return false

  // Playback may start before the user has interacted enough to unlock audio.
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})

  if (!analyser) {
    analyser = ctx.createAnalyser()
    analyser.fftSize = FFT_SIZE
    analyser.smoothingTimeConstant = 0.6
    analyser.connect(ctx.destination)
    frequencyData = new Uint8Array(analyser.frequencyBinCount)
  }

  if (!connectedElements.has(audioElement)) {
    try {
      const source = ctx.createMediaElementSource(audioElement)
      source.connect(analyser)
      connectedElements.add(audioElement)
    } catch {
      // Element already routed elsewhere — analysis will simply be skipped.
      return false
    }
  }

  active = true
  audioElement.addEventListener('ended', stopAnalysis, { once: true })
  audioElement.addEventListener('pause', stopAnalysis, { once: true })

  return true
}

export function stopAnalysis() {
  active = false
}

/**
 * Current mouth state, read once per rendered frame.
 * `intensity` is 0-1 openness; `roundness` is 0 (wide) to 1 (rounded).
 */
export function readMouth() {
  if (!active || !analyser || !frequencyData) {
    return { intensity: 0, roundness: 0.5, active: false }
  }

  analyser.getByteFrequencyData(frequencyData)

  const nyquist = (audioContext?.sampleRate ?? 44100) / 2
  const binWidth = nyquist / frequencyData.length
  const startBin = Math.max(1, Math.floor(MIN_FREQ / binWidth))
  const endBin = Math.min(frequencyData.length - 1, Math.ceil(MAX_FREQ / binWidth))

  let total = 0
  let weighted = 0

  for (let i = startBin; i <= endBin; i++) {
    const magnitude = frequencyData[i] / 255
    total += magnitude
    weighted += magnitude * (i * binWidth)
  }

  const binCount = endBin - startBin + 1
  const loudness = total / binCount

  if (loudness < SILENCE_THRESHOLD) {
    return { intensity: 0, roundness: 0.5, active: true }
  }

  // Centre of spectral mass, normalised across the speech range.
  const centroid = total > 0 ? weighted / total : MIN_FREQ
  const roundness = 1 - clamp((centroid - MIN_FREQ) / (2200 - MIN_FREQ), 0, 1)

  // Loudness is compressed because speech rarely reaches the top of the range,
  // and a mouth that never opens fully looks lifeless.
  const intensity = clamp((loudness - SILENCE_THRESHOLD) * 3.2, 0, 1)

  return { intensity, roundness, active: true }
}

/**
 * Converts the mouth state into Oculus viseme weights, the blend shapes shipped
 * on Ready Player Me avatars. Vowel shapes carry the motion; a touch of a
 * sibilant shape on bright sounds keeps it from looking like pure chewing.
 */
export function toVisemeWeights({ intensity, roundness }) {
  // Every viseme is always present, including the zeros. Returning a partial set
  // would leave the previous frame's shapes stuck on when speech stops.
  if (intensity <= 0) {
    return {
      viseme_sil: 1,
      viseme_aa: 0,
      viseme_O: 0,
      viseme_U: 0,
      viseme_E: 0,
      viseme_I: 0,
      viseme_SS: 0,
    }
  }

  const wide = 1 - roundness

  return {
    viseme_sil: 0,
    viseme_aa: intensity * (0.35 + wide * 0.45),
    viseme_O: intensity * roundness * 0.75,
    viseme_U: intensity * roundness * 0.35,
    viseme_E: intensity * wide * 0.5,
    viseme_I: intensity * wide * 0.35,
    viseme_SS: intensity * Math.max(0, wide - 0.65) * 0.6,
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}
