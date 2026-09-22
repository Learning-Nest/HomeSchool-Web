import { useCallback, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ErrorPanel } from '../components/ErrorPanel'
import { Loading } from '../components/Loading'
import { StatusBadge } from '../components/StatusBadge'
import { formatDateTime, levelRange } from '../format'
import { STATUSES, statusLabel } from '../domain/status'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useRequest } from '../hooks/useRequest'

const PAGE_SIZE = 25

export function ActivitiesPage() {
  useDocumentTitle('Activities')
  const { api } = useAuth()
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ''
  const subject = params.get('subject') ?? ''
  const q = params.get('q') ?? ''
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)

  // The API returns a bare list without a total, so ask for one extra row to learn whether a next page exists.
  const loadRows = useCallback(
    (signal: AbortSignal) =>
      api.listActivities({ status, subject, q, limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE }, signal),
    [api, status, subject, q, page],
  )
  const { data, error, loading, reload } = useRequest(loadRows)
  const loadSubjects = useCallback((signal: AbortSignal) => api.subjects(signal), [api])
  const { data: subjects } = useRequest(loadSubjects)

  const rows = useMemo(() => (data ? data.slice(0, PAGE_SIZE) : []), [data])
  const hasNext = (data?.length ?? 0) > PAGE_SIZE
  const filtered = status !== '' || subject !== '' || q !== ''

  function update(changes: Record<string, string>) {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next)
  }

  return (
    <>
      <h1>Activities</h1>
      <form
        className="filters"
        role="search"
        aria-label="Filter activities"
        onSubmit={(e) => {
          e.preventDefault()
          update({ q: String(new FormData(e.currentTarget).get('q') ?? '').trim() })
        }}
      >
        <label className="field">
          <span className="field-label">Status</span>
          <select value={status} onChange={(e) => update({ status: e.target.value })}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Subject</span>
          <select value={subject} onChange={(e) => update({ subject: e.target.value })}>
            <option value="">All subjects</option>
            {subject && !subjects?.some((s) => s.code === subject) && <option value={subject}>{subject}</option>}
            {subjects?.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field field-grow">
          <span className="field-label">Search title or slug</span>
          <input key={q} type="search" name="q" defaultValue={q} maxLength={80} />
        </label>
        <button type="submit" className="btn btn-primary">
          Search
        </button>
        {filtered && (
          <button type="button" className="btn" onClick={() => setParams(new URLSearchParams())}>
            Clear filters
          </button>
        )}
      </form>

      {error && <ErrorPanel error={error} onRetry={reload} />}
      {!error && !data && <Loading label="Loading activities…" />}
      {!error && data && (
        <div aria-busy={loading}>
          {rows.length === 0 ? (
            <p className="panel">
              {filtered ? 'No activities match these filters.' : 'There are no activities yet. Import a bundle to add some.'}
            </p>
          ) : (
            <div className="table-wrap" role="region" aria-label="Activities table" tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Title</th>
                    <th scope="col">Subject</th>
                    <th scope="col">Levels</th>
                    <th scope="col" className="num">
                      Duration
                    </th>
                    <th scope="col">Status</th>
                    <th scope="col" className="num">
                      Version
                    </th>
                    <th scope="col">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id}>
                      <th scope="row">
                        <Link to={`/activities/${a.id}`}>{a.title}</Link>
                        <span className="slug">{a.slug}</span>
                      </th>
                      <td>{a.subject_code}</td>
                      <td>{levelRange(a.level_from, a.level_to)}</td>
                      <td className="num">{a.duration_min} min</td>
                      <td>
                        <StatusBadge status={a.status} />
                      </td>
                      <td className="num">{a.version}</td>
                      <td>
                        <time dateTime={a.updated_at}>{formatDateTime(a.updated_at)}</time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <nav className="pager" aria-label="Pages">
            <button
              type="button"
              className="btn"
              disabled={page <= 1}
              onClick={() => update({ page: page > 2 ? String(page - 1) : '' })}
            >
              Previous
            </button>
            <span>
              Page {page}
              {rows.length > 0 && ` · rows ${(page - 1) * PAGE_SIZE + 1}–${(page - 1) * PAGE_SIZE + rows.length}`}
            </span>
            <button type="button" className="btn" disabled={!hasNext} onClick={() => update({ page: String(page + 1) })}>
              Next
            </button>
          </nav>
        </div>
      )}
    </>
  )
}
