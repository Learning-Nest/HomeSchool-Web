import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/errors'
import { NotAdminError, useAuth } from '../auth/AuthContext'
import { ErrorPanel } from '../components/ErrorPanel'
import { EnvBadge } from '../components/EnvBadge'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

/** Only in-app paths are honoured as a place to return to. */
function safeReturnPath(state: unknown): string {
  const from = typeof state === 'object' && state !== null && 'from' in state ? (state as { from: unknown }).from : null
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && from !== '/login' ? from : '/'
}

export function LoginPage() {
  useDocumentTitle('Sign in')
  const { user, notice, signIn } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const returnTo = safeReturnPath(location.state)
  if (user) return <Navigate to={returnTo} replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
      await navigate(returnTo, { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
      setBusy(false)
    }
  }

  return (
    <main className="login-page" id="main">
      <form className="login-card" onSubmit={submit} aria-labelledby="login-heading">
        <div className="login-brand">
          <span className="brand">HomeSchooling Admin</span>
          <EnvBadge />
        </div>
        <h1 id="login-heading">Sign in</h1>
        <p className="muted">For content administrators only.</p>
        {notice && (
          <p className="panel panel-info" role="status">
            {notice}
          </p>
        )}
        {error instanceof NotAdminError && (
          <div className="panel panel-error" role="alert">
            <p className="panel-title">This account does not have access to the content console.</p>
            <p>
              The password was correct, but only content administrators can sign in here. Family accounts use the
              app. Ask a super admin if you need access.
            </p>
          </div>
        )}
        {error && !(error instanceof NotAdminError) && <ErrorPanel error={error} />}
        <label className="field">
          <span className="field-label">Email</span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={error instanceof ApiError && error.code === 'invalid_credentials' ? true : undefined}
          />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
