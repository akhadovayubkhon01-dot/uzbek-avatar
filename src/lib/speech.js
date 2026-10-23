import { attachAudio, stopAnalysis } from './lipsync'

const LOCAL_TTS_URL = 'http://127.0.0.1:8000/tts'

export function pickVoice(language, gender = 'female') {
  const voices = speechSynthesis.getVoices()
  const langPrefix = language === 'uz' ? 'uz' : 'en'

  const englishVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('en'))

  const isFemaleName = (name) => {
    const n = name.toLowerCase()
    return (
      n.includes('female') ||
      ['zira', 'susan', 'hazel', 'linda', 'samantha', 'victoria', 'karen'].some((h) =>
        n.includes(h),
      )
    )
  }

  // Checked after female, because "female" contains the substring "male".
  const isMaleName = (name) => {
    const n = name.toLowerCase()
    if (isFemaleName(name)) return false
    return (
      n.includes('male') ||
      ['david', 'mark', 'george', 'james', 'daniel', 'alex'].some((h) => n.includes(h))
    )
  }

  const genderMatch = englishVoices.find((v) =>
    gender === 'male' ? isMaleName(v.name) : isFemaleName(v.name),
  )

  return (
    genderMatch ||
    voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix)) ||
    englishVoices[0] ||
    voices[0]
  )
}

export function speak(text, language, gender, onStart, onEnd) {
  if (language === 'uz') return speakLocal(text, onStart, onEnd)
  return speakBrowser(text, language, gender, onStart, onEnd)
}

function speakBrowser(text, language, gender, onStart, onEnd) {
  speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = language === 'uz' ? 'uz-UZ' : 'en-US'
  utterance.rate = 0.95
  utterance.pitch = 1

  const voice = pickVoice(language, gender)
  if (voice) utterance.voice = voice

  utterance.onstart = () => onStart?.()
  utterance.onend = () => onEnd?.()
  utterance.onerror = () => onEnd?.()

  speechSynthesis.speak(utterance)

  return () => {
    speechSynthesis.cancel()
    onEnd?.()
  }
}

// Splits an answer into short pieces for the local Uzbek voice: sentences, and
// long sentences again at commas. The first piece can then be played while the
// next ones are still being synthesised, so speech starts after one sentence
// instead of after the whole answer.
const MAX_CHUNK_WORDS = 18

export function splitForSpeech(text) {
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => /[\p{L}\p{N}]/u.test(s))

  const chunks = []
  for (const sentence of sentences) {
    if (sentence.split(' ').length <= MAX_CHUNK_WORDS) {
      chunks.push(sentence)
      continue
    }
    // Long sentence: break at commas/semicolons, keeping pieces reasonably sized.
    let current = ''
    for (const part of sentence.split(/(?<=[,;:])\s+/)) {
      const candidate = current ? `${current} ${part}` : part
      if (current && candidate.split(' ').length > MAX_CHUNK_WORDS) {
        chunks.push(current)
        current = part
      } else {
        current = candidate
      }
    }
    if (current) chunks.push(current)
  }
  return chunks
}

async function synthesize(text, signal) {
  const res = await fetch(LOCAL_TTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal,
  })
  if (!res.ok) throw new Error(`Local TTS service returned ${res.status}`)
  return URL.createObjectURL(await res.blob())
}

function playUrl(url, isCancelled, onPlaying) {
  return new Promise((resolve) => {
    const audio = new Audio(url)
    const finish = () => {
      URL.revokeObjectURL(url)
      resolve()
    }
    audio.onended = finish
    audio.onerror = finish
    audio.onpause = finish
    if (isCancelled()) {
      finish()
      return
    }
    onPlaying(audio)
    audio.play().catch(finish)
  })
}

// Uzbek speech from the local TTS service, piece by piece. Only one piece is
// synthesised at a time (the service runs on the CPU, so parallel requests
// would just slow the first one down); the next piece is requested as soon as
// the previous one is ready, while it plays. Returns a stop function.
function speakLocal(text, onStart, onEnd) {
  const controller = new AbortController()
  let cancelled = false
  let current = null
  let ended = false

  const end = () => {
    if (ended) return
    ended = true
    stopAnalysis()
    onEnd?.()
  }

  const run = async () => {
    const chunks = splitForSpeech(text)
    if (!chunks.length) return end()

    let next
    try {
      next = synthesize(chunks[0], controller.signal)
      await next
    } catch (err) {
      if (cancelled) return end()
      console.warn('Local Uzbek TTS unavailable, falling back to browser voice:', err)
      speakBrowser(text, 'uz', 'female', onStart, onEnd)
      return
    }

    let started = false
    for (let i = 0; i < chunks.length && !cancelled; i++) {
      let url
      try {
        url = await next
      } catch (err) {
        if (!cancelled) console.warn('Local Uzbek TTS failed on part of the answer:', err)
        break
      }
      // Start synthesising the following piece while this one plays.
      next = i + 1 < chunks.length ? synthesize(chunks[i + 1], controller.signal) : null
      next?.catch(() => {})

      await playUrl(url, () => cancelled, (audio) => {
        current = audio
        attachAudio(audio)
        if (!started) {
          started = true
          onStart?.()
        }
      })
    }
    end()
  }

  run()

  return () => {
    cancelled = true
    controller.abort()
    current?.pause()
    end()
  }
}

export function stopSpeaking() {
  speechSynthesis.cancel()
  stopAnalysis()
}

export function isSpeechRecognitionSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

export function listen(language, onResult, onEnd) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SpeechRecognition) return null

  const recognition = new SpeechRecognition()
  recognition.lang = language === 'uz' ? 'uz-UZ' : 'en-US'
  recognition.interimResults = false
  recognition.maxAlternatives = 1

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript
    onResult(transcript)
  }
  recognition.onend = onEnd
  recognition.onerror = onEnd

  recognition.start()
  return recognition
}

export function loadVoices() {
  return new Promise((resolve) => {
    const voices = speechSynthesis.getVoices()
    if (voices.length) {
      resolve(voices)
      return
    }
    speechSynthesis.onvoiceschanged = () => resolve(speechSynthesis.getVoices())
  })
}