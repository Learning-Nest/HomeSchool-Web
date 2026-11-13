import { useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { AdminActivitySummary, BulkAssignmentResult } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { BulkAssignDialog } from '../components/BulkAssignDialog'
import { ErrorPanel } from '../components/ErrorPanel'
import { Loading } from '../components/Loading'
import { StatusBadge } from '../components/StatusBadge'
import { formatDateTime, levelRange } from '../format'
import { STATUSES, statusLabel } from '../domain/status'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useRequest } from '../hooks/useRequest'

/** How many rows one page can show. The first is the default. */
export const PAGE_SIZES = [50, 100, 200, 500, 1000] as const

const SKIP_REASONS: Record<string, string> = {
  not_found: 'no longer exists',
  not_draft: 'is no longer a draft',
  already_assigned: 'was already with this educator',
}

function describeResult(result: BulkAssignmentResult, educator: string): string {
  const n = result.assigned
  const parts: string[] = []
  if (n === 0) parts.push(`Nothing was assigned to ${educator}.`)
  else {
    parts.push(`${n} ${n === 1 ? 'activity' : 'activities'} assigned to ${educator}.`)
    parts.push(result.email_sent ? 'They were sent one email.' : 'The email could not be sent; let them know yourself.')
  }
  if (result.skipped.length > 0) {
    parts.push(`${result.skipped.length} skipped: ${[...new Set(result.skipped.map((x) => SKIP_REASONS[x.reason] ?? x.reason))].join(', ')}.`)
  }
  return parts.join(' ')
}

/** Small tags next to the status that tell an author what to do next. */
function Flags({ a }: { a: AdminActivitySummary }) {
  if (a.status !== 'draft') return null
  if (a.review_note) return <span className="flag flag-warn">Sent back</span>
  if (a.is_validated) return <span className="flag flag-ok">Checked</span>
  return null
}

export function ActivitiesPage() {
  const { api, isAdmin } = useAuth()
  useDocumentTitle(isAdmin ? 'Activities' : 'My activities')
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ''
  const subject = params.get('subject') ?? ''
  const author = isAdmin ? (params.get('author') ?? '') : ''
  const q = params.get('q') ?? ''
  const level = params.get('level') ?? ''
  const requestedSize = Number.parseInt(params.get('size') ?? '', 10)
  const pageSize = PAGE_SIZES.find((n) => n === requestedSize) ?? PAGE_SIZES[0]
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)

  // The API returns a bare list without a total, so ask for one extra row to learn whether a next page exists.
  const loadRows = useCallback(
    (signal: AbortSignal) =>
      api.listActivities({ status, subject, author, q, level, limit: pageSize + 1, offset: (page - 1) * pageSize }, signal),
    [api, status, subject, author, q, level, page, pageSize],
  )
  const { data, error, loading, reload } = useRequest(loadRows)
  const loadSubjects = useCallback((signal: AbortSignal) => api.subjects(signal), [api])
  const { data: subjects } = useRequest(loadSubjects)
  const loadLevels = useCallback((signal: AbortSignal) => api.levels(signal), [api])
  const { data: levels } = useRequest(loadLevels)
  const loadEducators = useCallback(
    (signal: AbortSignal) => (isAdmin ? api.listEducators(signal) : Promise.resolve([])),
    [api, isAdmin],
  )
  const { data: educators } = useRequest(loadEducators)

  const rows = useMemo(() => (data ? data.slice(0, pageSize) : []), [data, pageSize])
  const hasNext = (data?.length ?? 0) > pageSize
  // Page size is a display choice, not a filter, so it does not count here and "Clear filters" keeps it.
  const filtered = status !== '' || subject !== '' || q !== '' || author !== '' || level !== ''

  // Only drafts can be handed to an educator. The picked ids belong to the view they were picked in: changing a filter,
  // the page or the page size starts a fresh selection instead of silently assigning rows that are no longer shown.
  const viewKey = `${status}|${subject}|${author}|${q}|${level}|${page}|${pageSize}`
  const [picked, setPicked] = useState<{ key: string; ids: ReadonlySet<string> }>({ key: '', ids: new Set() })
  const [assigning, setAssigning] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const selected = picked.key === viewKey ? picked.ids : new Set<string>()
  const draftIds = useMemo(() => rows.filter((r) => r.status === 'draft').map((r) => r.id), [rows])
  const allPicked = draftIds.length > 0 && draftIds.every((id) => selected.has(id))
  const somePicked = selected.size > 0 && !allPicked

  function toggle(id: string) {
    const ids = new Set(selected)
    if (ids.has(id)) ids.delete(id)
    else ids.add(id)
    setPicked({ key: viewKey, ids })
  }
  function toggleAll() {
    setPicked({ key: viewKey, ids: allPicked ? new Set() : new Set(draftIds) })
  }

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
      <div className="section-head">
        <h1>{isAdmin ? 'Activities' : 'My activities'}</h1>
        <Link className="btn btn-primary" to="/activities/new">
          New activity
        </Link>
      </div>
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
          <span className="field-label">Level</span>
          <select value={level} onChange={(e) => update({ level: e.target.value })}>
            <option value="">All levels</option>
            {level && !levels?.some((l) => l.code === level) && <option value={level}>{level}</option>}
            {levels?.map((l) => (
              <option key={l.code} value={l.code}>
                {l.code}
                {l.name && l.name !== l.code ? ` · ${l.name}` : ''}
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
        {isAdmin && (
          <label className="field">
            <span className="field-label">Added by</span>
            <select value={author} onChange={(e) => update({ author: e.target.value })}>
              <option value="">Anyone</option>
              {author && !educators?.some((u) => u.id === author) && <option value={author}>Selected person</option>}
              {educators?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field field-grow">
          <span className="field-label">Search title or slug</span>
          <input key={q} type="search" name="q" defaultValue={q} maxLength={80} />
        </label>
        <button type="submit" className="btn btn-primary">
          Search
        </button>
        {filtered && (
          <button
            type="button"
            className="btn"
            onClick={() => setParams(pageSize === PAGE_SIZES[0] ? new URLSearchParams() : new URLSearchParams({ size: String(pageSize) }))}
          >
            Clear filters
          </button>
        )}
      </form>

      {notice && (
        <p className="panel panel-success" role="status">
          {notice}
        </p>
      )}
      {error && <ErrorPanel error={error} onRetry={reload} />}
      {!error && !data && <Loading label="Loading activities…" />}
      {!error && data && (
        <div aria-busy={loading}>
          {rows.length === 0 ? (
            <p className="panel">
              {filtered
                ? 'No activities match these filters.'
                : isAdmin
                  ? 'There are no activities yet. Start a new one or import a bundle.'
                  : 'You have not started any activities yet. Choose “New activity” to begin.'}
            </p>
          ) : (
            <>
              {isAdmin && (
                <div className="bulk-bar" role="group" aria-label="Bulk actions">
                  <span role="status">
                    {selected.size === 0
                      ? draftIds.length === 0
                        ? 'No drafts on this page to assign.'
                        : 'Tick drafts to assign them to an educator together.'
                      : `${selected.size} ${selected.size === 1 ? 'draft' : 'drafts'} selected`}
                  </span>
                  <button type="button" className="btn btn-primary" disabled={selected.size === 0} onClick={() => setAssigning(true)}>
                    Assign to an educator…
                  </button>
                  {selected.size > 0 && (
                    <button type="button" className="btn" onClick={() => setPicked({ key: viewKey, ids: new Set() })}>
                      Clear selection
                    </button>
                  )}
                </div>
              )}
            <div className="table-wrap" role="region" aria-label="Activities table" tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    {isAdmin && (
                      <th scope="col" className="select-col">
                        <input
                          type="checkbox"
                          aria-label="Select all drafts on this page"
                          checked={allPicked}
                          ref={(el) => {
                            if (el) el.indeterminate = somePicked
                          }}
                          disabled={draftIds.length === 0}
                          onChange={toggleAll}
                        />
                      </th>
                    )}
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
                    {isAdmin && <th scope="col">Added by</th>}
                    <th scope="col">Last edited</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => {
                    const editedAt = a.last_edited_at ?? a.updated_at
                    return (
                      <tr key={a.id} aria-selected={isAdmin && a.status === 'draft' ? selected.has(a.id) : undefined}>
                        {isAdmin && (
                          <td className="select-col">
                            <input
                              type="checkbox"
                              aria-label={a.status === 'draft' ? `Select ${a.title}` : `${a.title} is not a draft, so it cannot be assigned`}
                              checked={selected.has(a.id)}
                              disabled={a.status !== 'draft'}
                              onChange={() => toggle(a.id)}
                            />
                          </td>
                        )}
                        <th scope="row">
                          <Link to={`/activities/${a.id}`}>{a.title}</Link>
                          <span className="slug">{a.slug}</span>
                        </th>
                        <td>{a.subject_code}</td>
                        <td>{levelRange(a.level_from, a.level_to)}</td>
                        <td className="num">{a.duration_min} min</td>
                        <td>
                          <StatusBadge status={a.status} /> <Flags a={a} />
                        </td>
                        <td className="num">{a.version}</td>
                        {isAdmin && (
                          <td>
                            {a.created_by_name ?? <span className="muted">{a.source === 'bundle' ? 'Imported' : '—'}</span>}
                          </td>
                        )}
                        <td>
                          <time dateTime={editedAt}>{formatDateTime(editedAt)}</time>
                          {a.last_edited_by_name && <span className="slug">by {a.last_edited_by_name}</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            </>
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
              {rows.length > 0 && ` · rows ${(page - 1) * pageSize + 1}–${(page - 1) * pageSize + rows.length}`}
            </span>
            <label className="page-size">
              <span>Rows per page</span>
              <select value={pageSize} onChange={(e) => update({ size: e.target.value === String(PAGE_SIZES[0]) ? '' : e.target.value })}>
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn" disabled={!hasNext} onClick={() => update({ page: String(page + 1) })}>
              Next
            </button>
          </nav>
        </div>
      )}
      {assigning && (
        <BulkAssignDialog
          activityIds={rows.filter((r) => selected.has(r.id)).map((r) => r.id)}
          onCancel={() => setAssigning(false)}
          onDone={(result, educatorName) => {
            setAssigning(false)
            setPicked({ key: viewKey, ids: new Set() })
            setNotice(describeResult(result, educatorName))
            reload()
          }}
        />
      )}
    </>
  )
}
