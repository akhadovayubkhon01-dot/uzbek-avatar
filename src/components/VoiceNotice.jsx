import { useEffect, useRef } from 'react'

// Shown when sound is turned on in Uzbek with the male voice selected: the
// Uzbek speech model only has a female voice for now.
export default function VoiceNotice({ onUseFemale, onClose }) {
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="name-prompt-backdrop" onClick={onClose}>
      <div
        className="name-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-notice-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="voice-notice-title" className="name-prompt-title">
          Erkak ovozi hali mavjud emas
        </h2>
        <p className="name-prompt-text">
          O&apos;zbek tilida hozircha faqat ayol ovozi bor. Erkak ovozi keyinroq qo&apos;shiladi.
          Javoblarni eshitish uchun ayol ovoziga o&apos;tishingiz mumkin.
        </p>
        <div className="name-prompt-actions">
          <button type="button" className="auth-submit" onClick={onUseFemale} autoFocus>
            Ayol ovoziga o&apos;tish
          </button>
          <button type="button" className="auth-switch" onClick={onClose}>
            Yopish
          </button>
        </div>
      </div>
    </div>
  )
}
