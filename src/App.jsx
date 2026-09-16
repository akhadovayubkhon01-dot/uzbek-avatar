import { useCallback, useEffect, useRef, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import Avatar from './components/Avatar'
import AvatarMenuBar from './components/AvatarMenuBar'
import Chat from './components/Chat'
import Games from './pages/Games'
import Duels from './pages/Duels'
import { chat } from './lib/ai'
import { loadVoices, listen, speak, stopSpeaking } from './lib/speech'
import { TEACHER_NAME } from './lib/prompts'
import './App.css'
import { getCurrentUser, onAuthChange, signOut } from './lib/auth'
import {
  createConversation,
  listConversations,
  loadMessages,
  saveMessage,
} from './lib/history'

function welcomeMessage(language) {
  return language === 'uz'
    ? `Assalomu alaykum! Men ${TEACHER_NAME}man — O'zbekiston tarixi, madaniyati va an'analari bo'yicha sizning AI o'qituvchingizman. Savol bering yoki quyidagi mavzulardan birini tanlang!`
    : `Welcome! I'm ${TEACHER_NAME}, your AI guide to Uzbek history, culture, and traditions. Ask me anything or choose a topic below!`
}

export default function App() {
  const [language, setLanguage] = useState('en')
  const [voiceGender, setVoiceGender] = useState('female')
  const [user, setUser] = useState(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [conversationId, setConversationId] = useState(null)
  const [conversations, setConversations] = useState([])
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [listening, setListening] = useState(false)
  const [autoSpeak, setAutoSpeak] = useState(true)
  const [activeTopic, setActiveTopic] = useState(null)
  const [lastModel, setLastModel] = useState(null)
  const stopSpeechRef = useRef(null)
  const recognitionRef = useRef(null)

  useEffect(() => {
    loadVoices()
  }, [])

  useEffect(() => {
    getCurrentUser().then(setUser)
    const unsubscribe = onAuthChange(setUser)
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!user) {
      setConversations([])
      setConversationId(null)
      return
    }
    listConversations()
      .then(setConversations)
      .catch((err) => console.warn('Could not load conversations:', err))
  }, [user])

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
        voiceGender,
        () => setSpeaking(true),
        () => setSpeaking(false),
      )
    },
    [language, voiceGender],
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

      let convId = conversationId
      if (user && !convId) {
        try {
          const title = trimmed.length > 50 ? `${trimmed.slice(0, 50)}...` : trimmed
          const conv = await createConversation(user.id, title)
          convId = conv.id
          setConversationId(convId)
          setConversations((prev) => [conv, ...prev])
        } catch (err) {
          console.warn('Could not create conversation:', err)
        }
      }

      if (convId) {
        saveMessage(convId, 'user', trimmed).catch((err) =>
          console.warn('Could not save user message:', err),
        )
      }

      try {
        const { content, model } = await chat(nextMessages, language, topicId)
        setMessages((prev) => [...prev, { role: 'assistant', content }])
        setLastModel(model ?? null)

        if (convId) {
          saveMessage(convId, 'assistant', content).catch((err) =>
            console.warn('Could not save reply:', err),
          )
        }

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
    [messages, loading, language, activeTopic, autoSpeak, readAloud, user, conversationId],
  )

  const handleSelectConversation = async (id) => {
    stopSpeaking()
    setConversationId(id)
    try {
      const past = await loadMessages(id)
      setMessages(past.length ? past : [{ role: 'assistant', content: welcomeMessage(language) }])
    } catch (err) {
      console.warn('Could not load messages:', err)
    }
  }

  const handleNewChat = () => {
    stopSpeaking()
    setConversationId(null)
    setActiveTopic(null)
    setMessages([{ role: 'assistant', content: welcomeMessage(language) }])
  }

  const handleTopic = (topic) => {
    setActiveTopic(topic.id)
    const prompt = language === 'uz' ? topic.promptUz : topic.promptEn
    sendMessage(prompt, topic.id)
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

  const home = (
    <div className="app">
      <AvatarMenuBar
        language={language}
        onLanguageChange={setLanguage}
        voiceGender={voiceGender}
        onVoiceGenderChange={setVoiceGender}
        user={user}
        authOpen={authOpen}
        onToggleAuth={() => setAuthOpen((v) => !v)}
        onSignOut={async () => {
          await signOut()
          setAuthOpen(false)
        }}
        conversations={conversations}
        conversationId={conversationId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        autoSpeak={autoSpeak}
        onToggleSpeak={() => setAutoSpeak((v) => !v)}
        onTopicSelect={handleTopic}
        topicsDisabled={loading}
        lastModel={lastModel}
      />

      <main className="main-layout">
        <section className="avatar-column" aria-label="Teacher avatar">
          <Avatar speaking={speaking} listening={listening} language={language} />
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
            ? "Demo rejim mavjud. 3D avatar ovozga qarab lab harakatini bajaradi."
            : 'Demo mode included. The 3D avatar lip-syncs to the generated speech.'}
        </p>
      </footer>
    </div>
  )

  return (
    <Routes>
      <Route path="/" element={home} />
      <Route path="/games" element={<Games language={language} />} />
      <Route path="/games/duels" element={<Duels language={language} />} />
    </Routes>
  )
}