import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { EnvBadge } from '../components/EnvBadge'
import { ErrorPanel } from '../components/ErrorPanel'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export const MIN_PASSWORD_LENGTH = 10

/** Shown after signing in with the emailed temporary password: the account can do nothing else until this is done. */
export function ChangePasswordPage() {
  useDocumentTitle('Choose a new password')
  const { user, mustChangePassword, changePassword, signOut } = useAuth()
  const navigate = useNavigate()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  if (!user) return <Navigate to="/login" replace />
  if (!mustChangePassword) return <Navigate to="/" replace />

  const tooShort = next.length > 0 && next.length < MIN_PASSWORD_LENGTH
  const mismatch = again.length > 0 && again !== next
  const sameAsOld = next.length > 0 && next === current
  const ready = current !== '' && next.length >= MIN_PASSWORD_LENGTH && again === next && !sameAsOld

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      await changePassword(current, next)
      await navigate('/', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
      setBusy(false)
    }
  }

  return (
    <main className="login-page" id="main">
      <form className="login-card" onSubmit={submit} aria-labelledby="pw-heading">
        <div className="login-brand">
          <span className="brand">HomeSchooling Content</span>
          <EnvBadge />
        </div>
        <h1 id="pw-heading">Choose a new password</h1>
        <p className="muted">
          You signed in with the temporary password from your invitation email. Choose your own password to continue.
        </p>
        {error && <ErrorPanel error={error} />}
        <label className="field">
          <span className="field-label">Temporary password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">New password</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            maxLength={128}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            aria-invalid={tooShort || sameAsOld ? true : undefined}
            aria-describedby="pw-rules"
          />
        </label>
        <p id="pw-rules" className={tooShort || sameAsOld ? 'field-error' : 'muted'}>
          {sameAsOld
            ? 'Choose a password different from the temporary one.'
            : `At least ${MIN_PASSWORD_LENGTH} characters.`}
        </p>
        <label className="field">
          <span className="field-label">New password again</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            maxLength={128}
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            aria-invalid={mismatch ? true : undefined}
          />
        </label>
        {mismatch && <p className="field-error">The two passwords do not match.</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy || !ready}>
          {busy ? 'Saving…' : 'Save password'}
        </button>
        <button type="button" className="btn btn-block" onClick={() => void signOut()} disabled={busy}>
          Sign out
        </button>
      </form>
    </main>
  )
}
