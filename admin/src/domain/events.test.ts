import { describe, expect, it } from 'vitest'
import { eventFixture } from '../test/fakeApi'
import { actionLabel, dateOnly, describeEvent, EVENT_ACTIONS } from './events'

const ev = (action: string, detail: Record<string, unknown> = {}, version: number | null = 1) =>
  eventFixture({ action, detail, version }) as Parameters<typeof describeEvent>[0]

describe('actionLabel', () => {
  it('uses plain words for every action the server records', () => {
    expect(actionLabel('created')).toBe('Started')
    expect(actionLabel('submitted')).toBe('Sent for review')
    expect(actionLabel('returned')).toBe('Sent back')
    expect(EVENT_ACTIONS.map((a) => a.value)).toContain('image_added')
  })

  it('shows an unknown action as it is rather than hiding it', () => {
    expect(actionLabel('something_new')).toBe('something_new')
  })
})

describe('describeEvent', () => {
  it('counts saves that were merged into one event', () => {
    expect(describeEvent(ev('edited', { saves: 7 }))).toBe('7 saves')
    expect(describeEvent(ev('edited', { saves: 1 }))).toBe('Saved changes')
    expect(describeEvent(ev('edited'))).toBe('Saved changes')
  })

  it('says what a check found', () => {
    expect(describeEvent(ev('validated', { ok: true }))).toBe('Passed all checks')
    expect(describeEvent(ev('validated', { ok: false, problems: 1 }))).toBe('1 problem found')
    expect(describeEvent(ev('validated', { ok: false, problems: 3 }))).toBe('3 problems found')
  })

  it('shows the reviewer note when a draft is sent back', () => {
    expect(describeEvent(ev('returned', { note: 'Add a picture to exercise 2' }))).toBe('Note: Add a picture to exercise 2')
    expect(describeEvent(ev('returned'))).toBe('Sent back for changes')
  })

  it('describes pictures, publishing and the rest', () => {
    expect(describeEvent(ev('image_added', { bytes: 20480 }))).toBe('20 KB')
    expect(describeEvent(ev('image_added'))).toBe('Picture added')
    expect(describeEvent(ev('published', {}, 4))).toBe('Live as version 4')
    expect(describeEvent(ev('published', {}, null))).toBe('Live in the app')
    expect(describeEvent(ev('created'))).toBe('Started a new draft')
    expect(describeEvent(ev('submitted'))).toBe('Waiting for a reviewer')
    expect(describeEvent(ev('archived'))).toBe('')
  })
})

describe('dateOnly', () => {
  it('keeps real YYYY-MM-DD values and drops anything else', () => {
    expect(dateOnly('2026-09-30')).toBe('2026-09-30')
    expect(dateOnly('30/09/2026')).toBeUndefined()
    expect(dateOnly('')).toBeUndefined()
    expect(dateOnly('2026-09-30T10:00')).toBeUndefined()
  })
})
