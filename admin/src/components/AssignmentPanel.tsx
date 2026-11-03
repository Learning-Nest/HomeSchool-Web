import { useCallback, useState } from 'react'
import type { Assignment } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { formatDueDate } from '../domain/assignments'
import { formatDateTime } from '../format'
import { useRequest } from '../hooks/useRequest'
import { AssignDialog } from './AssignDialog'
import { AssignmentBadge } from './AssignmentBadge'
import { ConfirmDialog } from './ConfirmDialog'
import { ErrorPanel } from './ErrorPanel'

interface Props {
  activityId: string
  activityTitle: string
  activityStatus: string
  /** Called after anything changed, so the page can refresh its history. */
  onChanged(): void
}

type Dialog = 'assign' | 'edit' | 'cancel' | null

/** Admin view of who holds this draft: assign, reassign, edit the brief or withdraw it. */
export function AssignmentPanel({ activityId, activityTitle, activityStatus, onChanged }: Props) {
  const { api } = useAuth()
  const [version, setVersion] = useState(0)
  const load = useCallback(
    (signal: AbortSignal) => {
      void version
      return api.listAssignments({ activity_id: activityId, live: true }, signal)
    },
    [api, activityId, version],
  )
  const { data, error, reload } = useRequest(load)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<Error | null>(null)

  const current: Assignment | null = data?.[0] ?? null
  const canAssign = activityStatus === 'draft'
  if (!current && !canAssign) return null

  function done(assignment: Assignment, emailSent: boolean | null) {
    setDialog(null)
    setVersion((v) => v + 1)
    onChanged()
    if (emailSent === null) setNotice('Assignment updated.')
    else if (emailSent) setNotice(`Assigned to ${assignment.educator_name ?? 'the educator'}. They have been emailed the brief.`)
    else
      setNotice(
        `Assigned to ${assignment.educator_name ?? 'the educator'}, but the email could not be sent. They will still see it under “My assignments” when they sign in.`,
      )
  }

  async function cancel() {
    if (!current) return
    setCancelling(true)
    setCancelError(null)
    try {
      await api.cancelAssignment(current.id)
      setDialog(null)
      setVersion((v) => v + 1)
      onChanged()
      setNotice('Assignment cancelled. The educator no longer has access to this draft.')
    } catch (e) {
      setCancelError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setCancelling(false)
    }
  }

  return (
    <section className="panel" aria-labelledby="assignment-heading">
      <h2 id="assignment-heading">Assignment</h2>
      {error && <ErrorPanel error={error} onRetry={reload} />}
      {!error && !data && <p role="status">Loading…</p>}
      {!error && data && !current && <p className="muted">Not assigned to anyone. Assign it to an educator to finish it.</p>}
      {current && (
        <>
          <dl className="meta">
            <div>
              <dt>Educator</dt>
              <dd>{current.educator_name ?? 'Unknown'}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <AssignmentBadge assignment={current} />
              </dd>
            </div>
            <div>
              <dt>Due</dt>
              <dd>{formatDueDate(current.due_date)}</dd>
            </div>
            <div>
              <dt>Assigned</dt>
              <dd>
                {current.assigned_by_name ? `${current.assigned_by_name} ` : ''}
                <time dateTime={current.created_at}>{formatDateTime(current.created_at)}</time>
              </dd>
            </div>
          </dl>
          <p className="brief">{current.requirements}</p>
        </>
      )}
      {notice && (
        <p className="panel panel-success" role="status">
          {notice}
        </p>
      )}
      <div className="button-row">
        {canAssign && (
          <button type="button" className={current ? 'btn' : 'btn btn-primary'} onClick={() => setDialog('assign')}>
            {current ? 'Reassign…' : 'Assign to an educator…'}
          </button>
        )}
        {current && (
          <>
            <button type="button" className="btn" onClick={() => setDialog('edit')}>
              Edit brief
            </button>
            <button type="button" className="btn" onClick={() => setDialog('cancel')}>
              Cancel assignment
            </button>
          </>
        )}
      </div>
      {dialog === 'assign' && (
        <AssignDialog activityId={activityId} activityTitle={activityTitle} onDone={done} onCancel={() => setDialog(null)} />
      )}
      {dialog === 'edit' && current && (
        <AssignDialog
          activityId={activityId}
          activityTitle={activityTitle}
          current={current}
          onDone={done}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog === 'cancel' && current && (
        <ConfirmDialog
          title="Cancel this assignment?"
          confirmLabel="Cancel assignment"
          cancelLabel="Keep it"
          danger
          busy={cancelling}
          onConfirm={() => void cancel()}
          onCancel={() => setDialog(null)}
        >
          <p>
            {current.educator_name ?? 'The educator'} will lose access to “{activityTitle}”. The draft itself is not
            changed.
          </p>
          {cancelError && <ErrorPanel error={cancelError} />}
        </ConfirmDialog>
      )}
    </section>
  )
}
