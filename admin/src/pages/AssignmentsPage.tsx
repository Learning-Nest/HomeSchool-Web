import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Assignment } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { AssignDialog } from '../components/AssignDialog'
import { AssignmentBadge } from '../components/AssignmentBadge'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorPanel } from '../components/ErrorPanel'
import { Loading } from '../components/Loading'
import { formatDueDate, isLive } from '../domain/assignments'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useRequest } from '../hooks/useRequest'

/** Educators see their own work; admins track everyone's. The server filters by role, the page only chooses the view. */
export function AssignmentsPage() {
  const { isAdmin } = useAuth()
  return isAdmin ? <AdminAssignments /> : <MyAssignments />
}

// ------------------------------------------------------------------------------------------------ educator
function MyAssignments() {
  useDocumentTitle('My assignments')
  const { api } = useAuth()
  const load = useCallback((signal: AbortSignal) => api.listAssignments({ limit: 200 }, signal), [api])
  const { data, error, reload } = useRequest(load)
  const todo = (data ?? []).filter((a) => a.status === 'open')
  const waiting = (data ?? []).filter((a) => a.status === 'submitted')
  const finished = (data ?? []).filter((a) => a.status === 'completed')

  return (
    <>
      <h1>My assignments</h1>
      <p className="muted">Drafts an administrator has asked you to finish. Open one to see what is needed and build it.</p>
      {error && <ErrorPanel error={error} onRetry={reload} />}
      {!error && !data && <Loading label="Loading your assignments…" />}
      {!error && data && todo.length + waiting.length + finished.length === 0 && (
        <p className="panel">Nothing has been assigned to you yet.</p>
      )}
      <AssignmentGroup heading="To do" items={todo} />
      <AssignmentGroup heading="Sent for review" items={waiting} />
      <AssignmentGroup heading="Finished" items={finished} />
    </>
  )
}

function AssignmentGroup({ heading, items }: { heading: string; items: Assignment[] }) {
  if (items.length === 0) return null
  return (
    <section aria-label={heading}>
      <h2>{heading}</h2>
      <ul className="card-list">
        {items.map((a) => (
          <li key={a.id} className="panel">
            <h3>
              <Link to={`/activities/${a.activity_id}`}>{a.activity_title}</Link> <AssignmentBadge assignment={a} />
            </h3>
            <p className="muted">
              Due: {formatDueDate(a.due_date)}
              {a.assigned_by_name ? ` · from ${a.assigned_by_name}` : ''}
            </p>
            <p className="brief">{a.requirements}</p>
            {a.review_note && (
              <p className="note-text">
                <strong>Sent back with this note:</strong> {a.review_note}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

// ------------------------------------------------------------------------------------------------ admin
type View = 'live' | 'overdue' | 'completed' | 'cancelled' | 'all'
const VIEWS: readonly { value: View; label: string }[] = [
  { value: 'live', label: 'Still in progress' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'Everything' },
]

type Action = { kind: 'edit' | 'reassign' | 'cancel'; assignment: Assignment } | null

function matches(a: Assignment, view: View): boolean {
  switch (view) {
    case 'live':
      return isLive(a)
    case 'overdue':
      return a.overdue
    case 'completed':
      return a.status === 'completed'
    case 'cancelled':
      return a.status === 'cancelled'
    default:
      return true
  }
}

function AdminAssignments() {
  useDocumentTitle('Assignments')
  const { api } = useAuth()
  const [version, setVersion] = useState(0)
  const load = useCallback(
    (signal: AbortSignal) => {
      void version
      return api.listAssignments({ limit: 500 }, signal)
    },
    [api, version],
  )
  const { data, error, reload } = useRequest(load)
  const [view, setView] = useState<View>('live')
  const [educator, setEducator] = useState('')
  const [action, setAction] = useState<Action>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<Error | null>(null)

  const all = useMemo(() => data ?? [], [data])
  const people = useMemo(() => {
    const seen = new Map<string, string>()
    for (const a of all) seen.set(a.educator_id, a.educator_name ?? 'Unknown')
    return [...seen.entries()].sort((x, y) => x[1].localeCompare(y[1]))
  }, [all])
  const perEducator = useMemo(() => {
    const rows = new Map<string, { name: string; open: number; submitted: number; overdue: number; completed: number }>()
    for (const a of all) {
      const row = rows.get(a.educator_id) ?? { name: a.educator_name ?? 'Unknown', open: 0, submitted: 0, overdue: 0, completed: 0 }
      if (a.status === 'open') row.open += 1
      if (a.status === 'submitted') row.submitted += 1
      if (a.overdue) row.overdue += 1
      if (a.status === 'completed') row.completed += 1
      rows.set(a.educator_id, row)
    }
    return [...rows.entries()].filter(([, r]) => r.open + r.submitted + r.completed > 0).sort((x, y) => x[1].name.localeCompare(y[1].name))
  }, [all])
  const shown = all.filter((a) => matches(a, view) && (!educator || a.educator_id === educator))

  function changed(message: string) {
    setAction(null)
    setNotice(message)
    setVersion((v) => v + 1)
  }

  async function cancel(a: Assignment) {
    setBusy(true)
    setActionError(null)
    try {
      await api.cancelAssignment(a.id)
      changed(`Cancelled the assignment of “${a.activity_title}” to ${a.educator_name ?? 'the educator'}.`)
    } catch (e) {
      setActionError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h1>Assignments</h1>
      <p className="muted">
        Drafts handed to educators. To assign one, open a draft from <Link to="/activities">Activities</Link> and use
        the Assignment panel.
      </p>
      {error && <ErrorPanel error={error} onRetry={reload} />}
      {!error && !data && <Loading label="Loading assignments…" />}
      {notice && (
        <p className="panel panel-success" role="status">
          {notice}
        </p>
      )}
      {!error && data && (
        <>
          {perEducator.length > 0 && (
            <div className="table-wrap" role="region" aria-label="Assignments per educator" tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Educator</th>
                    <th scope="col" className="num">
                      With them
                    </th>
                    <th scope="col" className="num">
                      Overdue
                    </th>
                    <th scope="col" className="num">
                      Sent for review
                    </th>
                    <th scope="col" className="num">
                      Completed
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {perEducator.map(([id, r]) => (
                    <tr key={id}>
                      <th scope="row">
                        <Link to={`/educators/${id}`}>{r.name}</Link>
                      </th>
                      <td className="num">{r.open}</td>
                      <td className="num">{r.overdue}</td>
                      <td className="num">{r.submitted}</td>
                      <td className="num">{r.completed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="filters">
            <label className="field">
              <span className="field-label">Show</span>
              <select value={view} onChange={(e) => setView(e.target.value as View)}>
                {VIEWS.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Educator</span>
              <select value={educator} onChange={(e) => setEducator(e.target.value)}>
                <option value="">Everyone</option>
                {people.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {shown.length === 0 ? (
            <p className="panel">No assignments match.</p>
          ) : (
            <div className="table-wrap" role="region" aria-label="Assignments" tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Activity</th>
                    <th scope="col">Educator</th>
                    <th scope="col">Due</th>
                    <th scope="col">Status</th>
                    <th scope="col">Brief</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((a) => (
                    <tr key={a.id}>
                      <th scope="row">
                        <Link to={`/activities/${a.activity_id}`}>{a.activity_title}</Link>
                        <span className="slug">{a.activity_slug}</span>
                      </th>
                      <td>
                        <Link to={`/educators/${a.educator_id}`}>{a.educator_name ?? 'Unknown'}</Link>
                      </td>
                      <td>{formatDueDate(a.due_date)}</td>
                      <td>
                        <AssignmentBadge assignment={a} />
                      </td>
                      <td className="brief-cell">{a.requirements}</td>
                      <td>
                        {isLive(a) && (
                          <div className="button-row">
                            <button
                              type="button"
                              className="btn btn-small"
                              aria-label={`Edit brief for ${a.activity_title}`}
                              onClick={() => setAction({ kind: 'edit', assignment: a })}
                            >
                              Edit
                            </button>
                            {a.status === 'open' && (
                              <button
                                type="button"
                                className="btn btn-small"
                                aria-label={`Reassign ${a.activity_title}`}
                                onClick={() => setAction({ kind: 'reassign', assignment: a })}
                              >
                                Reassign
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-small"
                              aria-label={`Cancel assignment of ${a.activity_title}`}
                              onClick={() => setAction({ kind: 'cancel', assignment: a })}
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {action?.kind === 'edit' && (
        <AssignDialog
          activityId={action.assignment.activity_id}
          activityTitle={action.assignment.activity_title}
          current={action.assignment}
          onDone={() => changed('Assignment updated.')}
          onCancel={() => setAction(null)}
        />
      )}
      {action?.kind === 'reassign' && (
        <AssignDialog
          activityId={action.assignment.activity_id}
          activityTitle={action.assignment.activity_title}
          onDone={(a, sent) =>
            changed(
              `Assigned to ${a.educator_name ?? 'the educator'}${sent ? ' and emailed.' : '. The email could not be sent; they will still see it when they sign in.'}`,
            )
          }
          onCancel={() => setAction(null)}
        />
      )}
      {action?.kind === 'cancel' && (
        <ConfirmDialog
          title="Cancel this assignment?"
          confirmLabel="Cancel assignment"
          cancelLabel="Keep it"
          danger
          busy={busy}
          onConfirm={() => void cancel(action.assignment)}
          onCancel={() => {
            setAction(null)
            setActionError(null)
          }}
        >
          <p>
            {action.assignment.educator_name ?? 'The educator'} will lose access to “{action.assignment.activity_title}”.
            The draft itself is not changed.
          </p>
          {actionError && <ErrorPanel error={actionError} />}
        </ConfirmDialog>
      )}
    </>
  )
}
