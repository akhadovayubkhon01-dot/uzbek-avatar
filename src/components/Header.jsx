import { useEffect, useState } from 'react'
import { checkAiStatus } from '../lib/ai'
import { TEACHER_NAME } from '../lib/prompts'

export default function Header({ language, onLanguageChange }) {
  const [showSettings, setShowSettings] = useState(false)
  const [aiReady, setAiReady] = useState(false)
  const [serverOk, setServerOk] = useState(false)

  useEffect(() => {
    if (showSettings) {
      checkAiStatus().then(({ ok, ai }) => {
        setServerOk(ok)
        setAiReady(ai)
      })
    }
  }, [showSettings])

  return (
    <header className="app-header app-header-compact">
      <div className="brand">
        <span className="brand-icon">🏺</span>
        <div>
          <h1>{TEACHER_NAME}</h1>
          <p className="tagline">
            {language === 'uz'
              ? "O'zbekiston tarixi va madaniyati"
              : 'Uzbek history & culture'}
          </p>
        </div>
      </div>

      <div className="header-actions">
        <div className="lang-toggle" role="group" aria-label="Language">
          <button
            type="button"
            className={language === 'uz' ? 'active' : ''}
            onClick={() => onLanguageChange('uz')}
          >
            O&apos;zbek
          </button>
          <button
            type="button"
            className={language === 'en' ? 'active' : ''}
            onClick={() => onLanguageChange('en')}
          >
            English
          </button>
        </div>

        <button
          type="button"
          className="settings-btn"
          onClick={() => setShowSettings((s) => !s)}
          aria-expanded={showSettings}
        >
          ⚙️
        </button>
      </div>

      {showSettings && (
        <div className="settings-panel">
          <p>
            {language === 'uz'
              ? 'Gemini API kaliti server .env faylida saqlanadi (GEMINI_API_KEY). Kalitsiz demo rejim ishlaydi.'
              : 'The Gemini API key lives in the server .env file (GEMINI_API_KEY). Demo mode works without it.'}
          </p>
          <p className="settings-status">
            {!serverOk
              ? language === 'uz'
                ? 'Server ishlamayapti'
                : 'Server not running'
              : aiReady
                ? language === 'uz'
                  ? '✓ AI rejimi faol'
                  : '✓ AI mode active'
                : language === 'uz'
                  ? 'Demo rejimi'
                  : 'Demo mode'}
          </p>
          <p className="settings-hint">
            {language === 'uz'
              ? "Yaxshi o'zbek ovozi uchun VITE_KOTIBAI_API_KEY ni .env faylida sozlang."
              : 'For better Uzbek voice, set VITE_KOTIBAI_API_KEY in .env (KotibAI TTS).'}
          </p>
        </div>
      )}
    </header>
  )
}
