import type { Assignment } from '../api/types'
import { assignmentStatusLabel } from '../domain/assignments'

/** The assignment's status; "Overdue" replaces "With the educator" once the due date has passed. */
export function AssignmentBadge({ assignment }: { assignment: Pick<Assignment, 'status' | 'overdue'> }) {
  if (assignment.overdue) return <span className="badge badge-overdue">Overdue</span>
  return <span className={`badge badge-${assignment.status}`}>{assignmentStatusLabel(assignment.status)}</span>
}
