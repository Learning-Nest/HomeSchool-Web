import { useCallback } from 'react'
import { useAuth } from '../auth/AuthContext'
import { formatDueDate } from '../domain/assignments'
import { useRequest } from '../hooks/useRequest'
import { AssignmentBadge } from './AssignmentBadge'

/** The educator's view of the brief that came with an assigned draft, shown above the builder. */
export function AssignmentBrief({ assignmentId }: { assignmentId: string }) {
  const { api } = useAuth()
  const load = useCallback((signal: AbortSignal) => api.getAssignment(assignmentId, signal), [api, assignmentId])
  const { data } = useRequest(load)
  if (!data) return null
  return (
    <section className="panel panel-info" aria-labelledby="brief-heading">
      <h2 id="brief-heading">
        What {data.assigned_by_name ?? 'an administrator'} asked for <AssignmentBadge assignment={data} />
      </h2>
      <p className="brief">{data.requirements}</p>
      <p className="muted">Due: {formatDueDate(data.due_date)}</p>
    </section>
  )
}
