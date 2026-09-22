import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ErrorPanel } from '../components/ErrorPanel'
import { Loading } from '../components/Loading'
import { STATUSES, statusLabel } from '../domain/status'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useRequest } from '../hooks/useRequest'

export function DashboardPage() {
  useDocumentTitle('Dashboard')
  const { api } = useAuth()
  const load = useCallback((signal: AbortSignal) => api.stats(signal), [api])
  const { data: stats, error, loading, reload } = useRequest(load)

  return (
    <>
      <h1>Dashboard</h1>
      {error && <ErrorPanel error={error} onRetry={reload} />}
      {!error && (loading || !stats) && <Loading label="Loading statistics…" />}
      {!error && stats && (
        <>
          <section aria-labelledby="platform-heading">
            <h2 id="platform-heading">Platform</h2>
            <dl className="stat-grid">
              <div className="stat">
                <dt>Users</dt>
                <dd>{stats.users}</dd>
              </div>
              <div className="stat">
                <dt>Families</dt>
                <dd>{stats.families}</dd>
              </div>
              <div className="stat">
                <dt>Skills</dt>
                <dd>{stats.skills}</dd>
              </div>
            </dl>
          </section>
          <section aria-labelledby="activities-heading">
            <h2 id="activities-heading">Activities by status</h2>
            <dl className="stat-grid">
              {STATUSES.map((status) => (
                <div className="stat" key={status}>
                  <dt>
                    <Link to={`/activities?status=${status}`}>{statusLabel(status)}</Link>
                  </dt>
                  <dd>{stats.activities_by_status[status] ?? 0}</dd>
                </div>
              ))}
            </dl>
            {stats.activities_by_status.published === 0 && (
              <p className="muted">Nothing is published yet, so children see no activities.</p>
            )}
          </section>
        </>
      )}
    </>
  )
}
