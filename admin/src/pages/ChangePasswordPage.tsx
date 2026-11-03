import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { EnvBadge } from '../components/EnvBadge'
import { ErrorPanel } from '../components/ErrorPanel'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export const MIN_PASSWORD_LENGTH = 10

/**
 * Two uses of one form. After signing in with an emailed temporary password the account can do nothing else until a
 * new password is chosen (forced). Anyone signed in can also change their password on purpose from the menu.
 */
export function ChangePasswordPage() {
  const { user, mustChangePassword, changePassword, signOut } = useAuth()
  // Decided when the page opens: once the password is saved the account no longer *must* change it.
  const [forced] = useState(mustChangePassword)
  useDocumentTitle(forced ? 'Choose a new password' : 'Change password')
  const navigate = useNavigate()
  const [done, setDone] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  if (!user) return <Navigate to="/login" replace />

  const tooShort = next.length > 0 && next.length < MIN_PASSWORD_LENGTH
  const mismatch = again.length > 0 && again !== next
  const sameAsOld = next.length > 0 && next === current
  const oldWord = forced ? 'the temporary one' : 'your current one'
  const ready = current !== '' && next.length >= MIN_PASSWORD_LENGTH && again === next && !sameAsOld

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      await changePassword(current, next)
      if (forced) {
        await navigate('/', { replace: true })
      } else {
        setDone(true)
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
      setBusy(false)
    }
  }

  if (done) {
    return (
      <main className="login-page" id="main">
        <div className="login-card">
          <div className="login-brand">
            <span className="brand">HomeSchooling Content</span>
            <EnvBadge />
          </div>
          <h1>Password changed</h1>
          <p className="panel panel-success" role="status">
            Your password has been changed. Any other device you were signed in on has been signed out.
          </p>
          <Link className="btn btn-primary btn-block" to="/">
            Back to the console
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="login-page" id="main">
      <form className="login-card" onSubmit={submit} aria-labelledby="pw-heading">
        <div className="login-brand">
          <span className="brand">HomeSchooling Content</span>
          <EnvBadge />
        </div>
        <h1 id="pw-heading">{forced ? 'Choose a new password' : 'Change your password'}</h1>
        <p className="muted">
          {forced
            ? 'You signed in with the temporary password from your email. Choose your own password to continue.'
            : 'Enter your current password, then choose a new one. Your other devices will be signed out.'}
        </p>
        {error && <ErrorPanel error={error} />}
        <label className="field">
          <span className="field-label">{forced ? 'Temporary password' : 'Current password'}</span>
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
            ? `Choose a password different from ${oldWord}.`
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
        {forced ? (
          <button type="button" className="btn btn-block" onClick={() => void signOut()} disabled={busy}>
            Sign out
          </button>
        ) : (
          <Link className="btn btn-block" to="/">
            Cancel
          </Link>
        )}
      </form>
    </main>
  )
}
