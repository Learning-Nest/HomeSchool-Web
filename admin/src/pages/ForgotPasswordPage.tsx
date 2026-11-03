import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { EnvBadge } from '../components/EnvBadge'
import { ErrorPanel } from '../components/ErrorPanel'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

/** Asks the server to email a temporary password. The answer never says whether the address has an account. */
export function ForgotPasswordPage() {
  useDocumentTitle('Forgot password')
  const { user, forgotPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  if (user) return <Navigate to="/" replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await forgotPassword(email.trim())
      setSent(true)
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-page" id="main">
      <form className="login-card" onSubmit={submit} aria-labelledby="forgot-heading">
        <div className="login-brand">
          <span className="brand">HomeSchooling Content</span>
          <EnvBadge />
        </div>
        <h1 id="forgot-heading">Forgot your password?</h1>
        {sent ? (
          <p className="panel panel-success" role="status">
            If that email address belongs to an account, a temporary password is on its way. It stops working after
            about an hour. Sign in with it and you will be asked to choose a new password.
          </p>
        ) : (
          <>
            <p className="muted">
              Enter your email address and we will email you a temporary password.
            </p>
            {error && <ErrorPanel error={error} />}
            <label className="field">
              <span className="field-label">Email</span>
              <input
                type="email"
                name="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? 'Sending…' : 'Email me a temporary password'}
            </button>
          </>
        )}
        <p className="login-links">
          <Link to="/login">Back to sign in</Link>
        </p>
      </form>
    </main>
  )
}
