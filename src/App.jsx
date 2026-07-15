import { useCallback, useEffect, useRef, useState } from 'react'
import Avatar from './components/Avatar'
import AvatarMenuBar from './components/AvatarMenuBar'
import Chat from './components/Chat'
import { chat } from './lib/ai'
import { loadVoices, listen, speak, stopSpeaking } from './lib/speech'
import { TEACHER_NAME } from './lib/prompts'
import './App.css'

function welcomeMessage(language) {
  return language === 'uz'
    ? `Assalomu alaykum! Men ${TEACHER_NAME}man — O'zbekiston tarixi, madaniyati va an'analari bo'yicha sizning AI o'qituvchingizman. Savol bering yoki quyidagi mavzulardan birini tanlang!`
    : `Welcome! I'm ${TEACHER_NAME}, your AI guide to Uzbek history, culture, and traditions. Ask me anything or choose a topic below!`
}

export default function App() {
  const [language, setLanguage] = useState('en')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [listening, setListening] = useState(false)
  const [autoSpeak, setAutoSpeak] = useState(true)
  const [activeTopic, setActiveTopic] = useState(null)
  const stopSpeechRef = useRef(null)
  const recognitionRef = useRef(null)

  useEffect(() => {
    loadVoices()
  }, [])

  useEffect(() => {
    setMessages([{ role: 'assistant', content: welcomeMessage(language) }])
    setActiveTopic(null)
  }, [language])

  const readAloud = useCallback(
    (text) => {
      stopSpeaking()
      stopSpeechRef.current?.()

      stopSpeechRef.current = speak(
        text,
        language,
        () => setSpeaking(true),
        () => setSpeaking(false),
      )
    },
    [language],
  )

  const sendMessage = useCallback(
    async (text, topicId = activeTopic) => {
      const trimmed = text.trim()
      if (!trimmed || loading) return

      const userMsg = { role: 'user', content: trimmed }
      const nextMessages = [...messages, userMsg]
      setMessages(nextMessages)
      setInput('')
      setLoading(true)

      try {
        const { content } = await chat(nextMessages, language, topicId)
        setMessages((prev) => [...prev, { role: 'assistant', content }])
        if (autoSpeak) readAloud(content)
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content:
              language === 'uz'
                ? `Xatolik yuz berdi: ${err.message}. Server ishlayotganini tekshiring.`
                : `Something went wrong: ${err.message}. Check that the server is running.`,
          },
        ])
      } finally {
        setLoading(false)
      }
    },
    [messages, loading, language, activeTopic, autoSpeak, readAloud],
  )


  const handleTopic = (topic) => {
    setActiveTopic(topic.id)
    const prompt = language === 'uz' ? topic.promptUz : topic.promptEn
    sendMessage(prompt, topic.id)
  }

  const handleFeature = (feature) => {
    setActiveTopic(null)
    const prompt = language === 'uz' ? feature.promptUz : feature.promptEn
    sendMessage(prompt)
  }

  const handleGame = (game) => {
    setActiveTopic(null)
    const prompt = language === 'uz' ? game.promptUz : game.promptEn
    sendMessage(prompt)
  }

  const handleMic = () => {
    if (listening) {
      recognitionRef.current?.stop()
      return
    }

    stopSpeaking()
    setSpeaking(false)

    const recognition = listen(
      language,
      (transcript) => setInput(transcript),
      () => setListening(false),
    )

    if (!recognition) {
      alert(
        language === 'uz'
          ? 'Brauzeringiz ovozni tanishni qo\'llab-quvvatlamaydi. Chrome yoki Edge sinab ko\'ring.'
          : 'Voice input is not supported in this browser. Try Chrome or Edge.',
      )
      return
    }

    recognitionRef.current = recognition
    setListening(true)
  }

  return (
    <div className="app">
      <AvatarMenuBar
        language={language}
        onLanguageChange={setLanguage}
        autoSpeak={autoSpeak}
        onToggleSpeak={() => setAutoSpeak((v) => !v)}
        onTopicSelect={handleTopic}
        onFeatureSelect={handleFeature}
        onGameSelect={handleGame}
        topicsDisabled={loading}
      />

      <main className="main-layout">
        <section className="avatar-column" aria-label="Teacher avatar">
          <Avatar speaking={speaking} listening={listening} />
        </section>

        <Chat
          messages={messages}
          input={input}
          onInputChange={setInput}
          onSubmit={() => sendMessage(input)}
          onMic={handleMic}
          listening={listening}
          loading={loading}
          language={language}
        />
      </main>

      <footer className="app-footer">
        <p>
          {language === 'uz'
            ? 'Demo rejim mavjud. 3D avatar va yaxshiroq o\'zbek ovozi keyingi bosqichda.'
            : 'Demo mode included. 3D avatar & premium Uzbek TTS are planned next.'}
        </p>
      </footer>
    </div>
  )
}
