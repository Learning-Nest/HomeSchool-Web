import type { ActivityStatus } from '../api/types'

export const STATUSES: readonly ActivityStatus[] = ['draft', 'in_review', 'published', 'archived']

/** Mirrors the server's transition table (backend-api app/routers/admin.py); the server stays the authority. */
const TRANSITIONS: Record<ActivityStatus, readonly ActivityStatus[]> = {
  draft: ['in_review', 'archived'],
  in_review: ['draft', 'published', 'archived'],
  published: ['archived'],
  archived: ['draft'],
}

export function isActivityStatus(value: string): value is ActivityStatus {
  return (STATUSES as readonly string[]).includes(value)
}

export function legalTransitions(status: string): readonly ActivityStatus[] {
  return isActivityStatus(status) ? TRANSITIONS[status] : []
}

/** Publishing makes content visible to children; archiving removes it from them. Both get a confirm step. */
export function needsConfirmation(target: ActivityStatus): boolean {
  return target === 'published' || target === 'archived'
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'draft':
      return 'Draft'
    case 'in_review':
      return 'In review'
    case 'published':
      return 'Published'
    case 'archived':
      return 'Archived'
    default:
      return status
  }
}

export function transitionLabel(from: string, target: ActivityStatus): string {
  if (target === 'in_review') return 'Send to review'
  if (target === 'published') return 'Publish'
  if (target === 'archived') return 'Archive'
  return from === 'archived' ? 'Restore as draft' : 'Back to draft'
}
