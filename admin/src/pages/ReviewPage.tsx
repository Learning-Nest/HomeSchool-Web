import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ErrorPanel } from '../components/ErrorPanel'
import { Loading } from '../components/Loading'
import { formatDateTime, levelRange } from '../format'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useRequest } from '../hooks/useRequest'

/** Activities that educators have sent for review, oldest first so nothing waits forever. */
export function ReviewPage() {
  useDocumentTitle('Review queue')
  const { api } = useAuth()
  const load = useCallback((signal: AbortSignal) => api.listActivities({ status: 'in_review', limit: 100, offset: 0 }, signal), [api])
  const { data, error, reload } = useRequest(load)
  const rows = data ? [...data].sort((a, b) => (a.submitted_at ?? a.updated_at).localeCompare(b.submitted_at ?? b.updated_at)) : []

  return (
    <>
      <h1>Review queue</h1>
      <p className="muted">Activities that are waiting for an administrator to publish them or send them back.</p>
      {error && <ErrorPanel error={error} onRetry={reload} />}
      {!error && !data && <Loading label="Loading the queue…" />}
      {!error && data && rows.length === 0 && <p className="panel">Nothing is waiting for review.</p>}
      {!error && data && rows.length > 0 && (
        <div className="table-wrap" role="region" aria-label="Activities waiting for review" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Subject</th>
                <th scope="col">Levels</th>
                <th scope="col">Added by</th>
                <th scope="col">Sent for review</th>
                <th scope="col">Checked</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const at = a.submitted_at ?? a.updated_at
                return (
                  <tr key={a.id}>
                    <th scope="row">
                      <Link to={`/activities/${a.id}`}>{a.title}</Link>
                      <span className="slug">{a.slug}</span>
                    </th>
                    <td>{a.subject_code}</td>
                    <td>{levelRange(a.level_from, a.level_to)}</td>
                    <td>{a.created_by_name ?? '—'}</td>
                    <td>
                      <time dateTime={at}>{formatDateTime(at)}</time>
                    </td>
                    <td>{a.is_validated ? 'Yes' : 'Not since the last edit'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
