import { useEffect, useRef, useState } from 'react'

// Shown when the voice switches gender but the avatar still has the other
// gender's default name. Offers a matching name, which the person can edit,
// or lets them keep the current one.
export default function NamePrompt({
  language,
  currentName,
  suggestion,
  gender,
  onConfirm,
  onKeep,
}) {
  const isUz = language === 'uz'
  const [name, setName] = useState(suggestion)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  // Kept in a ref so the Escape listener below is set up once, not on every
  // keystroke (the parent passes a new function each render).
  const onKeepRef = useRef(onKeep)
  useEffect(() => {
    onKeepRef.current = onKeep
  }, [onKeep])

  useEffect(() => {
    inputRef.current?.select()

    const onKey = (e) => {
      if (e.key === 'Escape') onKeepRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const genderWord =
    gender === 'female'
      ? isUz
        ? 'ayol'
        : 'female'
      : isUz
        ? 'erkak'
        : 'male'

  const otherGenderWord =
    gender === 'female'
      ? isUz
        ? 'erkak'
        : 'male'
      : isUz
        ? 'ayol'
        : 'female'

  const submit = async (e) => {
    e.preventDefault()
    if (!name.trim()) {
      setError(isUz ? 'Ism kiriting.' : 'Enter a name.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onConfirm(name)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="name-prompt-backdrop" onClick={onKeep}>
      <form
        className="name-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="name-prompt-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2 id="name-prompt-title" className="name-prompt-title">
          {isUz ? 'Ismni ham almashtiraylikmi?' : 'Change the name too?'}
        </h2>
        <p className="name-prompt-text">
          {isUz
            ? `Ovoz endi ${genderWord}, lekin ${currentName} — ${otherGenderWord} ismi. Yangi ism tanlaysizmi?`
            : `The voice is now ${genderWord}, but ${currentName} is a ${otherGenderWord} name. Would you like a different name?`}
        </p>

        <input
          ref={inputRef}
          type="text"
          className="auth-input"
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          disabled={saving}
          aria-label={isUz ? 'Yangi ism' : 'New name'}
        />

        {error && <p className="auth-error">{error}</p>}

        <div className="name-prompt-actions">
          <button type="submit" className="auth-submit" disabled={saving}>
            {isUz ? 'Shu ismni qo\'yish' : 'Use this name'}
          </button>
          <button type="button" className="auth-switch" onClick={onKeep} disabled={saving}>
            {isUz ? `${currentName} qolsin` : `Keep ${currentName}`}
          </button>
        </div>
      </form>
    </div>
  )
}
