import { describe, expect, it } from 'vitest'
import { isActivityStatus, legalTransitions, needsConfirmation, STATUSES, transitionLabel } from './status'

describe('status transitions', () => {
  it('offers exactly the server-side transitions', () => {
    expect(legalTransitions('draft')).toEqual(['in_review', 'archived'])
    expect(legalTransitions('in_review')).toEqual(['draft', 'published', 'archived'])
    expect(legalTransitions('published')).toEqual(['archived'])
    expect(legalTransitions('archived')).toEqual(['draft'])
  })

  it('never offers publishing straight from draft or from archived', () => {
    expect(legalTransitions('draft')).not.toContain('published')
    expect(legalTransitions('archived')).not.toContain('published')
    expect(legalTransitions('published')).not.toContain('draft')
  })

  it('offers nothing for an unknown status', () => {
    expect(legalTransitions('deleted')).toEqual([])
    expect(isActivityStatus('deleted')).toBe(false)
    expect(STATUSES.every(isActivityStatus)).toBe(true)
  })

  it('asks for confirmation only when publishing or archiving', () => {
    expect(needsConfirmation('published')).toBe(true)
    expect(needsConfirmation('archived')).toBe(true)
    expect(needsConfirmation('in_review')).toBe(false)
    expect(needsConfirmation('draft')).toBe(false)
  })

  it('words the buttons by intent', () => {
    expect(transitionLabel('draft', 'in_review')).toBe('Send to review')
    expect(transitionLabel('in_review', 'draft')).toBe('Back to draft')
    expect(transitionLabel('archived', 'draft')).toBe('Restore as draft')
  })
})
