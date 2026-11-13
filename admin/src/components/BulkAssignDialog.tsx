import { useCallback, useState } from 'react'
import type { BulkAssignmentResult } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { todayIso } from '../domain/assignments'
import { useRequest } from '../hooks/useRequest'
import { ConfirmDialog } from './ConfirmDialog'
import { ErrorPanel } from './ErrorPanel'

interface Props {
  /** The drafts picked in the list. */
  activityIds: string[]
  onDone(result: BulkAssignmentResult, educatorName: string): void
  onCancel(): void
}

/** One brief and one due date for every picked draft, all to one educator, who gets a single email with the count. */
export function BulkAssignDialog({ activityIds, onDone, onCancel }: Props) {
  const { api } = useAuth()
  const loadEducators = useCallback((signal: AbortSignal) => api.listEducators(signal), [api])
  const { data: educators, error: loadError, reload } = useRequest(loadEducators)
  const active = (educators ?? []).filter((e) => e.active)

  const [educatorId, setEducatorId] = useState('')
  const [requirements, setRequirements] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const count = activityIds.length
  const ready = requirements.trim() !== '' && educatorId !== ''

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const result = await api.bulkAssign({
        activity_ids: activityIds,
        educator_id: educatorId,
        requirements: requirements.trim(),
        due_date: dueDate || null,
      })
      onDone(result, educators?.find((e) => e.id === educatorId)?.full_name ?? 'the educator')
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
      setBusy(false)
    }
  }

  return (
    <ConfirmDialog
      title={`Assign ${count} ${count === 1 ? 'draft' : 'drafts'} to an educator`}
      confirmLabel={`Assign ${count}`}
      busy={busy}
      confirmDisabled={!ready}
      onConfirm={() => void submit()}
      onCancel={onCancel}
    >
      <p>
        Every selected draft gets the same brief and due date. The educator is sent <strong>one</strong> email that says
        how many were assigned. A draft someone else holds moves to this person; anything that is no longer a draft is
        skipped.
      </p>
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
      {error && <ErrorPanel error={error} />}
    </ConfirmDialog>
  )
}
