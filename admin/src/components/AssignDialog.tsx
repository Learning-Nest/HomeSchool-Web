import { useCallback, useState } from 'react'
import type { Assignment, AssignmentCreated } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { todayIso } from '../domain/assignments'
import { useRequest } from '../hooks/useRequest'
import { ConfirmDialog } from './ConfirmDialog'
import { ErrorPanel } from './ErrorPanel'

interface Props {
  activityId: string
  activityTitle: string
  /** Set to edit the brief and due date of a live assignment; leave out to assign (or reassign) the draft. */
  current?: Pick<Assignment, 'id' | 'educator_id' | 'requirements' | 'due_date'> | null
  /** Called with the saved assignment. `emailSent` is only known when the assignment was just made. */
  onDone(assignment: Assignment, emailSent: boolean | null): void
  onCancel(): void
}

/** The brief an admin writes for an educator: who, what is needed (free text) and an optional due date. */
export function AssignDialog({ activityId, activityTitle, current, onDone, onCancel }: Props) {
  const { api } = useAuth()
  const editing = Boolean(current)
  const loadEducators = useCallback((signal: AbortSignal) => api.listEducators(signal), [api])
  const { data: educators, error: loadError, reload } = useRequest(loadEducators)
  const active = (educators ?? []).filter((e) => e.active)

  const [educatorId, setEducatorId] = useState('')
  const [requirements, setRequirements] = useState(current?.requirements ?? '')
  const [dueDate, setDueDate] = useState(current?.due_date ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const reassigning = !editing && Boolean(educatorId)
  const ready = requirements.trim() !== '' && (editing || educatorId !== '')

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      if (current) {
        const updated = await api.updateAssignment(current.id, {
          requirements: requirements.trim(),
          due_date: dueDate || null,
        })
        onDone(updated, null)
      } else {
        const created: AssignmentCreated = await api.assignActivity(activityId, {
          educator_id: educatorId,
          requirements: requirements.trim(),
          due_date: dueDate || null,
        })
        onDone(created.assignment, created.email_sent)
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
      setBusy(false)
    }
  }

  return (
    <ConfirmDialog
      title={editing ? 'Edit the assignment' : 'Assign this draft to an educator'}
      confirmLabel={editing ? 'Save changes' : 'Assign'}
      busy={busy}
      confirmDisabled={!ready}
      onConfirm={() => void submit()}
      onCancel={onCancel}
    >
      <p>
        “{activityTitle}”{' '}
        {editing
          ? 'is with the educator now. Changes to the brief are visible to them straight away; they are not emailed.'
          : 'will open for that educator, who is emailed the brief. They can edit it until they send it for review.'}
      </p>
      {!editing && (
        <>
          {loadError && <ErrorPanel error={loadError} onRetry={reload} />}
          <label className="field">
            <span className="field-label">Educator</span>
            <select value={educatorId} onChange={(e) => setEducatorId(e.target.value)} disabled={!educators}>
              <option value="">{educators ? (active.length ? 'Choose an educator' : 'No active educators yet') : 'Loading…'}</option>
              {active.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name} ({e.email})
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <label className="field">
        <span className="field-label">What is needed</span>
        <textarea
          rows={6}
          maxLength={4000}
          value={requirements}
          onChange={(e) => setRequirements(e.target.value)}
          placeholder="For example: six exercises on counting to 20, one hands-on task, a hint on every question."
        />
      </label>
      <label className="field">
        <span className="field-label">Due date (optional)</span>
        <input type="date" min={todayIso()} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </label>
      {reassigning && <p className="muted">If someone else holds this draft, it moves to this person.</p>}
      {error && <ErrorPanel error={error} />}
    </ConfirmDialog>
  )
}
