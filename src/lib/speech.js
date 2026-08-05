const LOCAL_TTS_URL = 'http://127.0.0.1:8000/tts'

export function pickVoice(language) {
  const voices = speechSynthesis.getVoices()
  const langPrefix = language === 'uz' ? 'uz' : 'en'

  return (
    voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix)) ||
    voices.find((v) => v.lang.toLowerCase().startsWith('en')) ||
    voices[0]
  )
}

export function speak(text, language, onStart, onEnd) {
  if (language === 'uz') {
    let currentAudio = null
    let cancelled = false

    speakLocal(
      text,
      onStart,
      onEnd,
      (audio) => {
        // speakLocal hands us the audio element once it's ready
        if (cancelled) {
          audio.pause()
        } else {
          currentAudio = audio
        }
      },
    )

    // Return a plain stop-function immediately
    return () => {
      cancelled = true
      if (currentAudio) {
        currentAudio.pause()
      }
      onEnd?.()
    }
  }

  return speakBrowser(text, language, onStart, onEnd)
}

function speakBrowser(text, language, onStart, onEnd) {
  speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = language === 'uz' ? 'uz-UZ' : 'en-US'
  utterance.rate = 0.95
  utterance.pitch = 1

  const voice = pickVoice(language)
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

async function speakLocal(text, onStart, onEnd, onAudioReady) {
  try {
    const res = await fetch(LOCAL_TTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    })

    if (!res.ok) throw new Error('Local TTS service returned an error')

    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)

    audio.onplay = () => onStart?.()
    audio.onended = () => {
      URL.revokeObjectURL(url)
      onEnd?.()
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      onEnd?.()
    }

    onAudioReady?.(audio)
    await audio.play()
  } catch (err) {
    console.warn('Local Uzbek TTS unavailable, falling back to browser voice:', err)
    speakBrowser(text, 'uz', onStart, onEnd)
  }
}

export function stopSpeaking() {
  speechSynthesis.cancel()
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