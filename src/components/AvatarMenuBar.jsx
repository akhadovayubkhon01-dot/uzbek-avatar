import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TOPICS } from '../data/topics'
import { checkAiStatus } from '../lib/ai'
import { fetchContent } from '../lib/content'
import { TEACHER_NAME } from '../lib/prompts'
import AuthPanel from './AuthPanel'

export default function AvatarMenuBar({
  language,
  onLanguageChange,
  voiceGender,
  onVoiceGenderChange,
  user,
  authOpen,
  onToggleAuth,
  onSignOut,
  conversations,
  conversationId,
  onSelectConversation,
  onNewChat,
  autoSpeak,
  onToggleSpeak,
  onTopicSelect,
  topicsDisabled,
  lastModel,
}) {
  const navigate = useNavigate()
  const [openMenu, setOpenMenu] = useState(null)
  const [aiReady, setAiReady] = useState(false)
  const [serverOk, setServerOk] = useState(false)
  const [chunks, setChunks] = useState(0)
  const [topics, setTopics] = useState(TOPICS)

  useEffect(() => {
    checkAiStatus().then(({ ok, ai, chunks }) => {
      setServerOk(ok)
      setAiReady(ai)
      setChunks(chunks ?? 0)
    })

    fetchContent().then(({ topics }) => {
      setTopics(topics)
    })
  }, [])

  const close = () => setOpenMenu(null)

  const toggle = (menu) => setOpenMenu((current) => (current === menu ? null : menu))

  return (
    <nav className="avatar-menu-bar" aria-label="App menu">
      <div className="menu-brand">
        <span className="menu-brand-name">{TEACHER_NAME}</span>
      </div>

      <div className="menu-items">
        <div className="menu-item">
          <button
            type="button"
            className={`menu-btn ${openMenu === 'topics' ? 'active' : ''}`}
            onClick={() => toggle('topics')}
            aria-expanded={openMenu === 'topics'}
          >
            {language === 'uz' ? 'Mavzular' : 'Topics'}
          </button>
          {openMenu === 'topics' && (
            <div className="menu-dropdown menu-dropdown-topics">
              {topics.map((topic) => (
                <button
                  key={topic.id}
                  type="button"
                  className="menu-dropdown-item"
                  disabled={topicsDisabled}
                  onClick={() => {
                    onTopicSelect(topic)
                    close()
                  }}
                >
                  {language === 'uz' ? topic.titleUz : topic.titleEn}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          className="menu-btn"
          onClick={() => {
            close()
            navigate('/games')
          }}
        >
          {language === 'uz' ? "O'yinlar" : 'Games'}
        </button>

        <div className="menu-item">
          <button
            type="button"
            className={`menu-btn ${openMenu === 'language' ? 'active' : ''}`}
            onClick={() => toggle('language')}
            aria-expanded={openMenu === 'language'}
          >
            {language === 'uz' ? "O'zbek" : 'English'}
          </button>
          {openMenu === 'language' && (
            <div className="menu-dropdown">
              <button
                type="button"
                className={`menu-dropdown-item ${language === 'uz' ? 'selected' : ''}`}
                onClick={() => {
                  onLanguageChange('uz')
                  close()
                }}
              >
                O&apos;zbek
              </button>
              <button
                type="button"
                className={`menu-dropdown-item ${language === 'en' ? 'selected' : ''}`}
                onClick={() => {
                  onLanguageChange('en')
                  close()
                }}
              >
                English
              </button>
            </div>
          )}
        </div>

        <div className="menu-item">
          <button
            type="button"
            className={`menu-btn ${openMenu === 'voice' ? 'active' : ''}`}
            onClick={() => toggle('voice')}
            aria-expanded={openMenu === 'voice'}
            title={
              language === 'uz'
                ? "O'zbekcha ovoz faqat ayol"
                : 'Voice gender (English only)'
            }
          >
            {voiceGender === 'male'
              ? language === 'uz'
                ? 'Erkak'
                : 'Male'
              : language === 'uz'
                ? 'Ayol'
                : 'Female'}
          </button>
          {openMenu === 'voice' && (
            <div className="menu-dropdown">
              <button
                type="button"
                className={`menu-dropdown-item ${voiceGender === 'female' ? 'selected' : ''}`}
                onClick={() => {
                  onVoiceGenderChange('female')
                  close()
                }}
              >
                {language === 'uz' ? 'Ayol' : 'Female'}
              </button>
              <button
                type="button"
                className={`menu-dropdown-item ${voiceGender === 'male' ? 'selected' : ''}`}
                disabled={language === 'uz'}
                onClick={() => {
                  onVoiceGenderChange('male')
                  close()
                }}
              >
                {language === 'uz'
                  ? 'Erkak (faqat inglizcha)'
                  : 'Male'}
              </button>
            </div>
          )}
        </div>

        {user && (
          <div className="menu-item">
            <button
              type="button"
              className={`menu-btn ${openMenu === 'history' ? 'active' : ''}`}
              onClick={() => toggle('history')}
              aria-expanded={openMenu === 'history'}
            >
              {language === 'uz' ? 'Tarix' : 'History'}
            </button>
            {openMenu === 'history' && (
              <div className="menu-dropdown menu-dropdown-history">
                <button
                  type="button"
                  className="menu-dropdown-item"
                  onClick={() => {
                    onNewChat()
                    close()
                  }}
                >
                  {language === 'uz' ? '+ Yangi suhbat' : '+ New chat'}
                </button>

                {conversations.length === 0 ? (
                  <p className="settings-status">
                    {language === 'uz' ? 'Hozircha suhbatlar yo\'q' : 'No conversations yet'}
                  </p>
                ) : (
                  conversations.map((conv) => (
                    <button
                      key={conv.id}
                      type="button"
                      className={`menu-dropdown-item ${conv.id === conversationId ? 'selected' : ''}`}
                      onClick={() => {
                        onSelectConversation(conv.id)
                        close()
                      }}
                    >
                      {conv.title}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        <div className="menu-item">
          <button
            type="button"
            className={`menu-btn ${authOpen ? 'active' : ''}`}
            onClick={() => {
              close()
              onToggleAuth()
            }}
            aria-expanded={authOpen}
          >
            {user
              ? user.email.split('@')[0]
              : language === 'uz'
                ? 'Kirish'
                : 'Sign in'}
          </button>
          {authOpen && (
            <div className="menu-dropdown menu-dropdown-auth">
              {user ? (
                <>
                  <p className="menu-dropdown-label">{user.email}</p>
                  <button
                    type="button"
                    className="menu-dropdown-item"
                    onClick={onSignOut}
                  >
                    {language === 'uz' ? 'Chiqish' : 'Sign out'}
                  </button>
                </>
              ) : (
                <AuthPanel language={language} onClose={onToggleAuth} />
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          className={`menu-btn menu-btn-icon ${autoSpeak ? 'active' : ''}`}
          onClick={onToggleSpeak}
          title={language === 'uz' ? 'Ovoz bilan o\'qish' : 'Read aloud'}
          aria-label={language === 'uz' ? 'Ovoz bilan o\'qish' : 'Read aloud'}
          aria-pressed={autoSpeak}
        >
          🔊
        </button>
        
        <div className="menu-item">
          <button
            type="button"
            className={`menu-btn menu-btn-icon ${openMenu === 'settings' ? 'active' : ''}`}
            onClick={() => toggle('settings')}
            aria-expanded={openMenu === 'settings'}
            aria-label={language === 'uz' ? 'Sozlamalar' : 'Settings'}
          >
            ⚙️
          </button>
          {openMenu === 'settings' && (
            <div className="menu-dropdown menu-dropdown-settings">
              <p className="menu-dropdown-label">
                {language === 'uz' ? 'Backend holati' : 'Backend status'}
              </p>
              <p className="settings-status">
                {!serverOk
                  ? language === 'uz'
                    ? 'Server ishlamayapti. npm run dev ni ishga tushiring.'
                    : 'Server not running. Start with npm run dev.'
                  : aiReady
                    ? language === 'uz'
                      ? '✓ AI rejimi faol (Gemini)'
                      : '✓ AI mode active (Gemini)'
                    : language === 'uz'
                      ? 'Demo rejimi — .env faylida GEMINI_API_KEY qo\'ying'
                      : 'Demo mode — set GEMINI_API_KEY in .env'}
              </p>

              <p className="menu-dropdown-label">
                {language === 'uz' ? 'RAG bilim bazasi' : 'RAG knowledge base'}
              </p>
              <p className="settings-status">
                {chunks > 0
                  ? language === 'uz'
                    ? `✓ ${chunks} ta bo'lak indekslangan`
                    : `✓ ${chunks} chunks indexed`
                  : language === 'uz'
                    ? 'Indeks yo\'q — npm run index ni ishga tushiring'
                    : 'No index — run npm run index'}
              </p>

              {lastModel && (
                <p className="settings-status">
                  {language === 'uz'
                    ? `Javob bergan model: ${lastModel}`
                    : `Answered by: ${lastModel}`}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {openMenu && (
        <button type="button" className="menu-backdrop" onClick={close} aria-label="Close menu" />
      )}
    </nav>
  )
}