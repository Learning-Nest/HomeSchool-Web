import type { Assignment, AssignmentStatus } from '../api/types'

export const ASSIGNMENT_STATUSES: readonly { value: AssignmentStatus; label: string }[] = [
  { value: 'open', label: 'With the educator' },
  { value: 'submitted', label: 'Sent for review' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

export function assignmentStatusLabel(status: string): string {
  return ASSIGNMENT_STATUSES.find((s) => s.value === status)?.label ?? status
}

/** Today as YYYY-MM-DD in the browser's own calendar, for the lowest date a due-date input accepts. */
export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/** A due date such as "12 Nov 2026". The value is a calendar day, so it is not shifted by the viewer's time zone. */
export function formatDueDate(value: string | null): string {
  if (!value) return 'No due date'
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return value
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(y, m - 1, d))
}

/** Live work (open or submitted) is what an admin still has to follow up on. */
export function isLive(a: Pick<Assignment, 'status'>): boolean {
  return a.status === 'open' || a.status === 'submitted'
}
