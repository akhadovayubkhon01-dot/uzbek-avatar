import { useState } from 'react'
import { signUp, signIn } from '../lib/auth'

export default function AuthPanel({ language, onClose }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const isUz = language === 'uz'

  const handleSubmit = async () => {
    setError('')

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

  return (
    <div className="auth-panel">
      <p className="auth-title">
        {mode === 'signup'
          ? isUz
            ? "Ro'yxatdan o'tish"
            : 'Create account'
          : isUz
            ? 'Kirish'
            : 'Sign in'}
      </p>

      <input
        type="email"
        className="auth-input"
        placeholder={isUz ? 'Email' : 'Email'}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={busy}
      />

      <input
        type="password"
        className="auth-input"
        placeholder={isUz ? 'Parol' : 'Password'}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={busy}
      />

      {error && <p className="auth-error">{error}</p>}

      <button
        type="button"
        className="auth-submit"
        onClick={handleSubmit}
        disabled={busy}
      >
        {busy
          ? isUz
            ? 'Kuting...'
            : 'Please wait...'
          : mode === 'signup'
            ? isUz
              ? "Ro'yxatdan o'tish"
              : 'Create account'
            : isUz
              ? 'Kirish'
              : 'Sign in'}
      </button>

      <button
        type="button"
        className="auth-switch"
        onClick={() => {
          setMode(mode === 'signup' ? 'login' : 'signup')
          setError('')
        }}
        disabled={busy}
      >
        {mode === 'signup'
          ? isUz
            ? 'Hisobingiz bormi? Kirish'
            : 'Already have an account? Sign in'
          : isUz
            ? "Hisob yaratish"
            : 'Create an account'}
      </button>
    </div>
  )
}