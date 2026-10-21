import { useCallback, useEffect, useRef, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import Avatar from './components/Avatar'
import AvatarMenuBar from './components/AvatarMenuBar'
import Chat from './components/Chat'
import NamePrompt from './components/NamePrompt'
import Games from './pages/Games'
import Duels from './pages/Duels'
import { chat } from './lib/ai'
import { loadVoices, listen, speak, stopSpeaking } from './lib/speech'
import { nameSuggestionFor, resolveTeacherName, sanitizeTeacherName } from './lib/prompts'
import './App.css'
import {
  getCurrentUser,
  getSavedTeacherName,
  onAuthChange,
  saveTeacherName,
  signOut,
} from './lib/auth'
import {
  createConversation,
  listConversations,
  loadMessages,
  saveMessage,
} from './lib/history'

const LOCAL_NAME_KEY = 'teacherName'
const LANGUAGE_KEY = 'language'

// The language the visitor last chose, so a reload doesn't reset it.
function readLanguage() {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY)
    return saved === 'uz' || saved === 'en' ? saved : 'en'
  } catch {
    return 'en'
  }
}

function writeLanguage(lang) {
  try {
    localStorage.setItem(LANGUAGE_KEY, lang)
  } catch {
    // Not persisted; the choice still applies for this visit.
  }
}

// Visitors who aren't signed in keep their chosen name in this browser only.
// Storage can be blocked (private windows), so failures fall back to the default.
function readLocalName() {
  try {
    return localStorage.getItem(LOCAL_NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

function writeLocalName(name) {
  try {
    if (name) localStorage.setItem(LOCAL_NAME_KEY, name)
    else localStorage.removeItem(LOCAL_NAME_KEY)
  } catch {
    // Not persisted; the name still applies for this visit.
  }
}

function welcomeMessage(language) {
  return language === 'uz' ? 'UzAvatarga xush kelibsiz' : 'Welcome to UzAvatar'
}

export default function App() {
  const [language, setLanguage] = useState(readLanguage)
  const [voiceGender, setVoiceGender] = useState('male')
  const [localName, setLocalName] = useState(readLocalName)
  const [namePrompt, setNamePrompt] = useState(null)
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

  // Signed-in users carry their name in their account; visitors keep it locally.
  const teacherName = resolveTeacherName({
    customName: user ? getSavedTeacherName(user) : localName,
  })

  const welcome = useCallback(
    () => ({ role: 'assistant', content: welcomeMessage(language), welcome: true }),
    [language],
  )

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
    setMessages([welcome()])
    setActiveTopic(null)
    // Only a language switch starts a fresh chat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language])

  // When only the greeting is showing, keep it in step with the current name.
  // An ongoing conversation is left untouched.
  useEffect(() => {
    setMessages((prev) =>
      prev.length === 1 && prev[0].welcome ? [welcome()] : prev,
    )
  }, [welcome])

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
        const { content, model } = await chat(nextMessages, language, topicId, teacherName)

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
    [
      messages,
      loading,
      language,
      activeTopic,
      autoSpeak,
      readAloud,
      user,
      conversationId,
      teacherName,
    ],
  )

  const handleSelectConversation = async (id) => {
    stopSpeaking()
    setConversationId(id)

    try {
      const past = await loadMessages(id)

      setMessages(
        past.length
          ? past
          : [welcome()],
      )
    } catch (err) {
      console.warn('Could not load messages:', err)
    }
  }

  const handleNewChat = () => {
    stopSpeaking()
    setConversationId(null)
    setActiveTopic(null)
    setMessages([welcome()])
  }

  const handleSaveName = async (name) => {
    const clean = sanitizeTeacherName(name)
    if (user) {
      const updated = await saveTeacherName(clean)
      setUser(updated)
    } else {
      setLocalName(clean)
      writeLocalName(clean)
    }
  }

  const handleVoiceGenderChange = (gender) => {
    setVoiceGender(gender)
    const suggestion = nameSuggestionFor(gender, teacherName)
    if (suggestion) setNamePrompt({ gender, suggestion })
  }

  // The voice setting stays the same across languages, so the avatar keeps
  // its gender and name when switching. Note: Uzbek speech currently has only
  // a female voice, so "male" in Uzbek still plays the female model until a
  // male Uzbek model is added (see speech.js).
  const handleLanguageChange = (lang) => {
    setLanguage(lang)
    writeLanguage(lang)
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
        onLanguageChange={handleLanguageChange}
        voiceGender={voiceGender}
        onVoiceGenderChange={handleVoiceGenderChange}
        user={user}
        teacherName={teacherName}
        savedName={user ? getSavedTeacherName(user) : localName}
        onSaveName={handleSaveName}
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
          <Avatar
            speaking={speaking}
            listening={listening}
            language={language}
            name={teacherName}
            portrait={voiceGender}
          />
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
          teacherName={teacherName}
        />
      </main>

      {namePrompt && (
        <NamePrompt
          language={language}
          currentName={teacherName}
          suggestion={namePrompt.suggestion}
          gender={namePrompt.gender}
          onConfirm={async (name) => {
            await handleSaveName(name)
            setNamePrompt(null)
          }}
          onKeep={() => setNamePrompt(null)}
        />
      )}

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