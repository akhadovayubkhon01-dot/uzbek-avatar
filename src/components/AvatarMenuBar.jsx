import { useEffect, useState } from 'react'
import { TOPICS } from '../data/topics'
import { FEATURES } from '../data/features'
import { GAMES } from '../data/games'
import { checkAiStatus } from '../lib/ai'
import { fetchContent } from '../lib/content'
import { TEACHER_NAME } from '../lib/prompts'

export default function AvatarMenuBar({
  language,
  onLanguageChange,
  autoSpeak,
  onToggleSpeak,
  onTopicSelect,
  onFeatureSelect,
  onGameSelect,
  topicsDisabled,
}) {
  const [openMenu, setOpenMenu] = useState(null)
  const [aiReady, setAiReady] = useState(false)
  const [serverOk, setServerOk] = useState(false)
  const [topics, setTopics] = useState(TOPICS)
  const [features, setFeatures] = useState(FEATURES)
  const [games, setGames] = useState(GAMES)

  useEffect(() => {
    checkAiStatus().then(({ ok, ai }) => {
      setServerOk(ok)
      setAiReady(ai)
    })

    fetchContent().then(({ topics, features, games }) => {
      setTopics(topics)
      setFeatures(features)
      setGames(games)
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

        <div className="menu-item">
          <button
            type="button"
            className={`menu-btn ${openMenu === 'features' ? 'active' : ''}`}
            onClick={() => toggle('features')}
            aria-expanded={openMenu === 'features'}
          >
            {language === 'uz' ? 'Imkoniyatlar' : 'Features'}
          </button>
          {openMenu === 'features' && (
            <div className="menu-dropdown menu-dropdown-wide">
              {features.map((feature) => (
                <button
                  key={feature.id}
                  type="button"
                  className="menu-dropdown-item"
                  disabled={topicsDisabled}
                  onClick={() => {
                    onFeatureSelect(feature)
                    close()
                  }}
                >
                  {language === 'uz' ? feature.titleUz : feature.titleEn}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="menu-item">
          <button
            type="button"
            className={`menu-btn ${openMenu === 'games' ? 'active' : ''}`}
            onClick={() => toggle('games')}
            aria-expanded={openMenu === 'games'}
          >
            {language === 'uz' ? 'O\'yinlar' : 'Games'}
          </button>
          {openMenu === 'games' && (
            <div className="menu-dropdown menu-dropdown-wide">
              {games.map((game) => (
                <button
                  key={game.id}
                  type="button"
                  className={`menu-dropdown-item ${game.comingSoon ? 'menu-dropdown-item-soon' : ''}`}
                  disabled={topicsDisabled || game.comingSoon}
                  onClick={() => {
                    if (!game.comingSoon) {
                      onGameSelect(game)
                      close()
                    }
                  }}
                >
                  {language === 'uz'
                    ? game.comingSoon
                      ? game.titleUzSoon ?? game.titleUz
                      : game.titleUz
                    : game.comingSoon
                      ? game.titleEnSoon ?? game.titleEn
                      : game.titleEn}
                </button>
              ))}
            </div>
          )}
        </div>

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
