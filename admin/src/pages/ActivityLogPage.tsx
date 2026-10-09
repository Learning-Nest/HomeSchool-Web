import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { saveBlob } from '../download'
import { dateOnly, EVENT_ACTIONS } from '../domain/events'
import { ErrorPanel } from '../components/ErrorPanel'
import { EventTable } from '../components/EventTable'
import { Loading } from '../components/Loading'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useRequest } from '../hooks/useRequest'

const PAGE_SIZE = 50

/** Everything educators and admins did to activities, newest first, with filters and a CSV export. */
export function ActivityLogPage() {
  useDocumentTitle('Activity log')
  const { api } = useAuth()
  const [params, setParams] = useSearchParams()
  const who = params.get('who') ?? ''
  const action = params.get('action') ?? ''
  const activity = params.get('activity') ?? ''
  const from = dateOnly(params.get('from') ?? '')
  const to = dateOnly(params.get('to') ?? '')
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)

  const query = { actor_id: who, action, activity_id: activity, from, to }
  const loadEvents = useCallback(
    (signal: AbortSignal) =>
      api.activityLog({ actor_id: who, action, activity_id: activity, from, to, limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE }, signal),
    [api, who, action, activity, from, to, page],
  )
  const { data, error, loading, reload } = useRequest(loadEvents)
  const loadPeople = useCallback((signal: AbortSignal) => api.listEducators(signal), [api])
  const { data: people } = useRequest(loadPeople)

  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<Error | null>(null)

  const rows = data ? data.slice(0, PAGE_SIZE) : []
  const hasNext = (data?.length ?? 0) > PAGE_SIZE
  const filtered = who !== '' || action !== '' || activity !== '' || from !== undefined || to !== undefined

  function update(changes: Record<string, string>) {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next)
  }

  async function exportCsv() {
    setExporting(true)
    setExportError(null)
    try {
      saveBlob(await api.activityLogCsv({ ...query, limit: 1000 }), 'activity-log.csv')
    } catch (e) {
      setExportError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <h1>Activity log</h1>
      <p className="muted">Who started, edited, checked, submitted, reviewed or published which activity, and when.</p>
      <form className="filters" aria-label="Filter the log" onSubmit={(e) => e.preventDefault()}>
        <label className="field">
          <span className="field-label">Who</span>
          <select value={who} onChange={(e) => update({ who: e.target.value })}>
            <option value="">Everyone</option>
            {who && !people?.some((p) => p.id === who) && <option value={who}>Selected person</option>}
            {people?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">What</span>
          <select value={action} onChange={(e) => update({ action: e.target.value })}>
            <option value="">Anything</option>
            {EVENT_ACTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">From</span>
          <input type="date" value={from ?? ''} onChange={(e) => update({ from: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">To</span>
          <input type="date" value={to ?? ''} onChange={(e) => update({ to: e.target.value })} />
        </label>
        {filtered && (
          <button type="button" className="btn" onClick={() => setParams(new URLSearchParams())}>
            Clear filters
          </button>
        )}
        <button type="button" className="btn" onClick={() => void exportCsv()} disabled={exporting}>
          {exporting ? 'Preparing…' : 'Download CSV'}
        </button>
      </form>
      {activity && <p className="muted">Showing one activity only.</p>}
      {exportError && <ErrorPanel error={exportError} />}

      {error && <ErrorPanel error={error} onRetry={reload} />}
      {!error && !data && <Loading label="Loading the log…" />}
      {!error && data && (
        <div aria-busy={loading}>
          {rows.length === 0 ? (
            <p className="panel">{filtered ? 'Nothing matches these filters.' : 'Nothing has been recorded yet.'}</p>
          ) : (
            <EventTable events={rows} label="Activity log" />
          )}
          <nav className="pager" aria-label="Pages">
            <button type="button" className="btn" disabled={page <= 1} onClick={() => update({ page: page > 2 ? String(page - 1) : '' })}>
              Previous
            </button>
            <span>Page {page}</span>
            <button type="button" className="btn" disabled={!hasNext} onClick={() => update({ page: String(page + 1) })}>
              Next
            </button>
          </nav>
        </div>
      )}
    </>
  )
}
