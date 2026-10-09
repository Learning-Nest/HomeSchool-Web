import type { ActivityEvent } from '../api/types'

/** The actions the activity log records (backend-api content.activity_events.action), in the order a filter lists them. */
export const EVENT_ACTIONS: readonly { value: string; label: string }[] = [
  { value: 'created', label: 'Started' },
  { value: 'edited', label: 'Edited' },
  { value: 'image_added', label: 'Picture added' },
  { value: 'image_removed', label: 'Picture removed' },
  { value: 'validated', label: 'Checked' },
  { value: 'submitted', label: 'Sent for review' },
  { value: 'returned', label: 'Sent back' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
  { value: 'reopened', label: 'Reopened as draft' },
]

export function actionLabel(action: string): string {
  return EVENT_ACTIONS.find((a) => a.value === action)?.label ?? action
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** A short plain-language line about one event, for the timeline and the log table. */
export function describeEvent(event: ActivityEvent): string {
  const d = event.detail
  switch (event.action) {
    case 'edited': {
      const saves = num(d.saves)
      return saves && saves > 1 ? `${saves} saves` : 'Saved changes'
    }
    case 'validated': {
      const problems = num(d.problems) ?? 0
      return d.ok === true ? 'Passed all checks' : `${problems} ${problems === 1 ? 'problem' : 'problems'} found`
    }
    case 'returned':
      return typeof d.note === 'string' && d.note ? `Note: ${d.note}` : 'Sent back for changes'
    case 'image_added': {
      const bytes = num(d.bytes)
      return bytes ? `${Math.max(1, Math.round(bytes / 1024))} KB` : 'Picture added'
    }
    case 'created':
      return 'Started a new draft'
    case 'submitted':
      return 'Waiting for a reviewer'
    case 'published':
      return event.version ? `Live as version ${event.version}` : 'Live in the app'
    default:
      return typeof d.note === 'string' ? d.note : ''
  }
}

/** The date a person typed in a filter (YYYY-MM-DD), or undefined when it is not one. */
export function dateOnly(value: string): string | undefined {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined
}
