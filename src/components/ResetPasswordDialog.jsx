import { useEffect, useRef, useState } from 'react'
import { updatePassword } from '../lib/auth'

const MIN_LENGTH = 6

// Shown after someone opens the password-reset link from their email. The link
// signs them in for this purpose; here they choose the new password.
// `linkError` is set when the link was invalid or expired.
export default function ResetPasswordDialog({ language, linkError, onDone }) {
  const isUz = language === 'uz'
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const inputRef = useRef(null)

  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') onDoneRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < MIN_LENGTH) {
      setError(
        isUz
          ? `Parol kamida ${MIN_LENGTH} ta belgidan iborat bo'lsin.`
          : `Use at least ${MIN_LENGTH} characters.`,
      )
      return
    }
    if (password !== confirm) {
      setError(isUz ? 'Parollar bir xil emas.' : "The passwords don't match.")
      return
    }
    setSaving(true)
    try {
      await updatePassword(password)
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="name-prompt-backdrop">
      <form
        className="name-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-password-title"
        onSubmit={submit}
      >
        <h2 id="reset-password-title" className="name-prompt-title">
          {isUz ? 'Yangi parol' : 'Set a new password'}
        </h2>

        {linkError ? (
          <>
            <p className="name-prompt-text">
              {isUz
                ? "Bu havola yaroqsiz yoki muddati o'tgan. Kirish oynasida \"Parolni unutdingizmi?\" tugmasini bosib, yangi havola so'rang."
                : 'This reset link is invalid or has expired. Use "Forgot password?" in the sign-in box to get a new one.'}
            </p>
            <div className="name-prompt-actions">
              <button type="button" className="auth-submit" onClick={onDone}>
                {isUz ? 'Yopish' : 'Close'}
              </button>
            </div>
          </>
        ) : done ? (
          <>
            <p className="name-prompt-text">
              {isUz
                ? "Parolingiz yangilandi. Siz hisobingizga kirgansiz."
                : 'Your password has been updated. You are signed in.'}
            </p>
            <div className="name-prompt-actions">
              <button type="button" className="auth-submit" onClick={onDone}>
                {isUz ? 'Davom etish' : 'Continue'}
              </button>
            </div>
          </>
        ) : (
          <>
            <input
              ref={inputRef}
              type="password"
              className="auth-input"
              placeholder={isUz ? 'Yangi parol' : 'New password'}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={saving}
            />
            <input
              type="password"
              className="auth-input"
              placeholder={isUz ? 'Parolni takrorlang' : 'Repeat new password'}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={saving}
            />

            {error && <p className="auth-error">{error}</p>}

            <div className="name-prompt-actions">
              <button type="submit" className="auth-submit" disabled={saving}>
                {saving ? (isUz ? 'Saqlanmoqda...' : 'Saving...') : isUz ? 'Parolni saqlash' : 'Save password'}
              </button>
              <button type="button" className="auth-switch" onClick={onDone} disabled={saving}>
                {isUz ? 'Bekor qilish' : 'Cancel'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}
