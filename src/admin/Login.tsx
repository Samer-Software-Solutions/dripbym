import { useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { useT } from './i18n'
import { Field, LangToggle, Spinner } from './ui'

export default function Login({ client }: { client: SupabaseClient }) {
  const { t, errorText } = useT()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  // Stored untranslated so the message follows a language switch.
  const [error, setError] = useState<{ kind: 'missing' } | { kind: 'wrong' } | { kind: 'other'; error: unknown } | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!email.trim() || !password) {
      setError({ kind: 'missing' })
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { error: signInError } = await client.auth.signInWithPassword({ email: email.trim(), password })
      if (signInError) {
        setError(
          signInError.message === 'Invalid login credentials' ? { kind: 'wrong' } : { kind: 'other', error: signInError },
        )
      }
      // On success the auth listener in AdminApp takes over.
    } catch (e) {
      setError({ kind: 'other', error: e })
    } finally {
      setBusy(false)
    }
  }

  const shownError = !error
    ? ''
    : error.kind === 'missing'
      ? t.loginMissing
      : error.kind === 'wrong'
        ? t.wrongCredentials
        : errorText(error.error)

  return (
    <div className="ad-center">
      <form className="ad-card ad-login" onSubmit={submit} noValidate>
        <div className="ad-login-top">
          <p className="ad-brand" dir="ltr">
            Drip by M
          </p>
          <LangToggle />
        </div>
        <h1>{t.loginTitle}</h1>
        <Field label={t.email} htmlFor="login-email">
          <input
            id="login-email"
            type="email"
            dir="ltr"
            autoComplete="username"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            autoFocus
            required
          />
        </Field>
        <Field label={t.password} htmlFor="login-password">
          <div className="ad-input-group">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              dir="ltr"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              required
            />
            <button
              type="button"
              className="ad-icon-btn"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? t.hidePassword : t.showPassword}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
            </button>
          </div>
        </Field>
        {shownError && (
          <p className="ad-form-error" role="alert">
            {shownError}
          </p>
        )}
        <button type="submit" className="ad-btn ad-btn--primary ad-btn--block" disabled={busy}>
          {busy ? <Spinner size={18} /> : <LogIn size={18} aria-hidden className="ad-flip" />}
          {busy ? t.signingIn : t.signIn}
        </button>
      </form>
    </div>
  )
}
