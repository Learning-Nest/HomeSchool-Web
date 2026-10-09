import { useCallback, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { EducatorCreated, EducatorSummary } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorPanel } from '../components/ErrorPanel'
import { Loading } from '../components/Loading'
import { formatDateTime } from '../format'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useRequest } from '../hooks/useRequest'

/** What happened when an educator was invited, in plain words. */
export function inviteMessage(result: EducatorCreated): string {
  const who = `${result.educator.full_name} (${result.educator.email})`
  if (result.existing_account) {
    return `${who} already had an account. They can now sign in here as an educator with their existing password.`
  }
  return result.email_sent
    ? `Invitation sent to ${who}. The email holds a temporary password that works for 7 days.`
    : `The account for ${who} was created, but the invitation email could not be sent. Ask them to use “Forgot password” on the sign-in screen of the app, or try the invitation again later.`
}

export function EducatorsPage() {
  useDocumentTitle('Educators')
  const { api, isSuperAdmin } = useAuth()
  const load = useCallback((signal: AbortSignal) => api.listEducators(signal), [api])
  const { data, error, reload } = useRequest(load)

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<Error | null>(null)
  const [invited, setInvited] = useState<EducatorCreated | null>(null)
  const [toggle, setToggle] = useState<EducatorSummary | null>(null)
  const [toggling, setToggling] = useState(false)
  const [toggleError, setToggleError] = useState<Error | null>(null)

  async function invite(event: FormEvent) {
    event.preventDefault()
    setInviting(true)
    setInviteError(null)
    setInvited(null)
    try {
      const result = await api.createEducator(email.trim(), name.trim())
      setInvited(result)
      setEmail('')
      setName('')
      reload()
    } catch (e) {
      setInviteError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setInviting(false)
    }
  }

  async function confirmToggle() {
    if (!toggle) return
    setToggling(true)
    setToggleError(null)
    try {
      await api.setEducatorActive(toggle.id, !toggle.active)
      setToggle(null)
      reload()
    } catch (e) {
      setToggleError(e instanceof Error ? e : new Error(String(e)))
      setToggle(null)
    } finally {
      setToggling(false)
    }
  }

  return (
    <>
      <h1>Educators</h1>
      <p className="muted">Everyone who can add activities, with how much they have done. Select a name to see their work.</p>

      {isSuperAdmin && (
        <section className="panel" aria-labelledby="invite-heading">
          <h2 id="invite-heading">Invite an educator</h2>
          <form className="field-row" onSubmit={invite}>
            <label className="field">
              <span className="field-label">Full name</span>
              <input type="text" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Email</span>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <div className="field field-action">
              <button type="submit" className="btn btn-primary" disabled={inviting}>
                {inviting ? 'Sending…' : 'Send invitation'}
              </button>
            </div>
          </form>
          {inviteError && <ErrorPanel error={inviteError} messages={{ conflict: 'This account already has a platform role.' }} />}
          {invited && (
            <p className="panel panel-success" role="status">
              {inviteMessage(invited)}
            </p>
          )}
        </section>
      )}

      {toggleError && <ErrorPanel error={toggleError} />}
      {error && <ErrorPanel error={error} onRetry={reload} />}
      {!error && !data && <Loading label="Loading educators…" />}
      {!error && data && data.length === 0 && <p className="panel">There are no educators yet.</p>}
      {!error && data && data.length > 0 && (
        <div className="table-wrap" role="region" aria-label="Educators table" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Status</th>
                <th scope="col" className="num">
                  Activities
                </th>
                <th scope="col" className="num">
                  Drafts
                </th>
                <th scope="col" className="num">
                  In review
                </th>
                <th scope="col" className="num">
                  Published
                </th>
                <th scope="col" className="num">
                  Sent back
                </th>
                <th scope="col">Last active</th>
                {isSuperAdmin && <th scope="col">Account</th>}
              </tr>
            </thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id}>
                  <th scope="row">
                    <Link to={`/educators/${u.id}`}>{u.full_name}</Link>
                    <span className="slug">{u.email}</span>
                  </th>
                  <td>{u.active ? 'Active' : 'Disabled'}</td>
                  <td className="num">{u.activities}</td>
                  <td className="num">{u.drafts}</td>
                  <td className="num">{u.in_review}</td>
                  <td className="num">{u.published}</td>
                  <td className="num">{u.returned}</td>
                  <td>{u.last_active_at ? <time dateTime={u.last_active_at}>{formatDateTime(u.last_active_at)}</time> : 'Never'}</td>
                  {isSuperAdmin && (
                    <td>
                      <button type="button" className="btn btn-small" onClick={() => setToggle(u)}>
                        {u.active ? 'Disable' : 'Enable'}
                        <span className="visually-hidden"> {u.full_name}</span>
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {toggle && (
        <ConfirmDialog
          title={toggle.active ? `Disable ${toggle.full_name}?` : `Enable ${toggle.full_name}?`}
          confirmLabel={toggle.active ? 'Disable' : 'Enable'}
          danger={toggle.active}
          busy={toggling}
          onConfirm={() => void confirmToggle()}
          onCancel={() => setToggle(null)}
        >
          <p>
            {toggle.active
              ? 'Their sessions end and they cannot sign in again. Their activities and history stay as they are.'
              : 'They can sign in again with their current password.'}
          </p>
        </ConfirmDialog>
      )}
    </>
  )
}
