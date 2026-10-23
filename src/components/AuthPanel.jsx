import { useState } from 'react'
import { sendPasswordReset, signIn, signUp } from '../lib/auth'

// mode: 'login' | 'signup' | 'forgot'
export default function AuthPanel({ language, onClose }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const isUz = language === 'uz'

  const switchMode = (next) => {
    setMode(next)
    setError('')
    setNotice('')
  }

  const handleSubmit = async () => {
    setError('')
    setNotice('')

    if (mode === 'forgot') {
      if (!email.trim()) {
        setError(isUz ? 'Emailingizni kiriting.' : 'Enter your email.')
        return
      }
      setBusy(true)
      try {
        await sendPasswordReset(email.trim())
        // Same message whether or not the account exists, so the form can't be
        // used to check which emails are registered.
        setNotice(
          isUz
            ? "Agar bu email bilan hisob mavjud bo'lsa, parolni tiklash havolasini yubordik. Pochtangizni (va Spam papkasini) tekshiring."
            : "If an account exists for this email, we've sent a link to reset your password. Check your inbox (and spam folder).",
        )
      } catch (err) {
        setError(err.message)
      } finally {
        setBusy(false)
      }
      return
    }

    if (!email.trim() || !password.trim()) {
      setError(isUz ? 'Email va parolni kiriting.' : 'Enter an email and password.')
      return
    }

    setBusy(true)
    try {
      if (mode === 'signup') {
        await signUp(email.trim(), password)
      } else {
        await signIn(email.trim(), password)
      }
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const title =
    mode === 'signup'
      ? isUz
        ? "Ro'yxatdan o'tish"
        : 'Create account'
      : mode === 'forgot'
        ? isUz
          ? 'Parolni tiklash'
          : 'Reset password'
        : isUz
          ? 'Kirish'
          : 'Sign in'

  const submitLabel = busy
    ? isUz
      ? 'Kuting...'
      : 'Please wait...'
    : mode === 'forgot'
      ? isUz
        ? 'Havola yuborish'
        : 'Send reset link'
      : title

  return (
    <form
      className="auth-panel"
      onSubmit={(e) => {
        e.preventDefault()
        handleSubmit()
      }}
    >
      <p className="auth-title">{title}</p>

      {mode === 'forgot' && (
        <p className="auth-hint">
          {isUz
            ? 'Emailingizni kiriting — yangi parol o\'rnatish uchun havola yuboramiz.'
            : "Enter your email and we'll send you a link to set a new password."}
        </p>
      )}

      <input
        type="email"
        className="auth-input"
        placeholder="Email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={busy}
      />

      {mode !== 'forgot' && (
        <input
          type="password"
          className="auth-input"
          placeholder={isUz ? 'Parol' : 'Password'}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />
      )}

      {mode === 'login' && (
        <button
          type="button"
          className="auth-link"
          onClick={() => switchMode('forgot')}
          disabled={busy}
        >
          {isUz ? 'Parolni unutdingizmi?' : 'Forgot password?'}
        </button>
      )}

      {error && <p className="auth-error">{error}</p>}
      {notice && <p className="auth-notice">{notice}</p>}

      <button type="submit" className="auth-submit" disabled={busy}>
        {submitLabel}
      </button>

      <button
        type="button"
        className="auth-switch"
        onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
        disabled={busy}
      >
        {mode === 'signup'
          ? isUz
            ? 'Hisobingiz bormi? Kirish'
            : 'Already have an account? Sign in'
          : mode === 'forgot'
            ? isUz
              ? 'Kirishga qaytish'
              : 'Back to sign in'
            : isUz
              ? 'Hisob yaratish'
              : 'Create an account'}
      </button>
    </form>
  )
}
