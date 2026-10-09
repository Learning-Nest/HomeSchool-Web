import { useCallback, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { saveBlob } from '../download'
import { dateOnly } from '../domain/events'
import { ErrorPanel } from '../components/ErrorPanel'
import { EventTable } from '../components/EventTable'
import { Loading } from '../components/Loading'
import { StatusBadge } from '../components/StatusBadge'
import { formatDateTime, levelRange } from '../format'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useRequest } from '../hooks/useRequest'

/** One educator's work: what they added, where each activity stands, and a dated timeline of what they did. */
export function EducatorDetailPage() {
  const { id = '' } = useParams()
  const { api } = useAuth()
  const [params, setParams] = useSearchParams()
  const from = dateOnly(params.get('from') ?? '')
  const to = dateOnly(params.get('to') ?? '')
  const load = useCallback((signal: AbortSignal) => api.educatorActivity(id, { from, to }, signal), [api, id, from, to])
  const { data, error, reload } = useRequest(load)
  useDocumentTitle(data?.educator.full_name ?? 'Educator')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<Error | null>(null)

  function setRange(changes: { from?: string; to?: string }) {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next)
  }

  async function exportCsv() {
    setExporting(true)
    setExportError(null)
    try {
      const blob = await api.activityLogCsv({ actor_id: id, from, to, limit: 1000 })
      saveBlob(blob, `educator-${id}-activity.csv`)
    } catch (e) {
      setExportError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <p className="breadcrumb">
        <Link to="/educators">← All educators</Link>
      </p>
      {error && <ErrorPanel error={error} onRetry={reload} messages={{ not_found: 'This educator does not exist.' }} />}
      {!error && (!data || data.educator.id !== id) && <Loading label="Loading educator…" />}
      {!error && data && data.educator.id === id && (
        <>
          <header className="editor-head">
            <h1>{data.educator.full_name}</h1>
            <span className={data.educator.active ? 'badge badge-published' : 'badge badge-archived'}>
              {data.educator.active ? 'Active' : 'Disabled'}
            </span>
          </header>
          <p className="muted">
            {data.educator.email} · joined <time dateTime={data.educator.created_at}>{formatDateTime(data.educator.created_at)}</time>
            {data.educator.last_active_at && (
              <>
                {' '}
                · last active <time dateTime={data.educator.last_active_at}>{formatDateTime(data.educator.last_active_at)}</time>
              </>
            )}
          </p>

          <dl className="stat-grid" aria-label="Totals">
            <div className="stat">
              <dt>Activities</dt>
              <dd>{data.educator.activities}</dd>
            </div>
            <div className="stat">
              <dt>Drafts</dt>
              <dd>{data.educator.drafts}</dd>
            </div>
            <div className="stat">
              <dt>In review</dt>
              <dd>{data.educator.in_review}</dd>
            </div>
            <div className="stat">
              <dt>Published</dt>
              <dd>{data.educator.published}</dd>
            </div>
            <div className="stat">
              <dt>Sent for review</dt>
              <dd>{data.educator.submissions}</dd>
            </div>
            <div className="stat">
              <dt>Sent back</dt>
              <dd>{data.educator.returned}</dd>
            </div>
          </dl>

          <section aria-labelledby="edu-activities-heading">
            <h2 id="edu-activities-heading">Activities ({data.activities.length})</h2>
            {data.activities.length === 0 ? (
              <p className="panel">{data.educator.full_name} has not added any activities yet.</p>
            ) : (
              <div className="table-wrap" role="region" aria-label="Activities by this educator" tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Title</th>
                      <th scope="col">Subject</th>
                      <th scope="col">Levels</th>
                      <th scope="col">Status</th>
                      <th scope="col">Added</th>
                      <th scope="col">Last edited</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.activities.map((a) => (
                      <tr key={a.id}>
                        <th scope="row">
                          <Link to={`/activities/${a.id}`}>{a.title}</Link>
                        </th>
                        <td>{a.subject_code}</td>
                        <td>{levelRange(a.level_from, a.level_to)}</td>
                        <td>
                          <StatusBadge status={a.status} />
                        </td>
                        <td>{a.created_at ? <time dateTime={a.created_at}>{formatDateTime(a.created_at)}</time> : '—'}</td>
                        <td>
                          {a.last_edited_at ? <time dateTime={a.last_edited_at}>{formatDateTime(a.last_edited_at)}</time> : '—'}
                          {a.last_edited_by_name && <span className="slug">by {a.last_edited_by_name}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-labelledby="edu-timeline-heading">
            <h2 id="edu-timeline-heading">What they did</h2>
            <form className="filters" aria-label="Date range" onSubmit={(e) => e.preventDefault()}>
              <label className="field">
                <span className="field-label">From</span>
                <input type="date" value={from ?? ''} onChange={(e) => setRange({ from: e.target.value })} />
              </label>
              <label className="field">
                <span className="field-label">To</span>
                <input type="date" value={to ?? ''} onChange={(e) => setRange({ to: e.target.value })} />
              </label>
              {(from || to) && (
                <button type="button" className="btn" onClick={() => setRange({ from: '', to: '' })}>
                  Clear dates
                </button>
              )}
              <button type="button" className="btn" onClick={() => void exportCsv()} disabled={exporting}>
                {exporting ? 'Preparing…' : 'Download CSV'}
              </button>
            </form>
            {exportError && <ErrorPanel error={exportError} />}
            {data.events.length === 0 ? (
              <p className="panel">{from || to ? 'Nothing happened in this period.' : 'Nothing has been recorded yet.'}</p>
            ) : (
              <EventTable events={data.events} showWho={false} label="Timeline" />
            )}
          </section>
        </>
      )}
    </>
  )
}
