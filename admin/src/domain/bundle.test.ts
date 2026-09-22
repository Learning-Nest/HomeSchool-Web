import { describe, expect, it } from 'vitest'
import { parseBundleText, reportRows, reportTotals } from './bundle'

describe('parseBundleText', () => {
  it('accepts the launch-bundle shape and counts entities', () => {
    const text = JSON.stringify({
      version: ' 2026.09.1 ',
      levels: [{ code: 'L1' }],
      skills: [{ code: 'A.B.C' }, { code: 'A.B.D' }],
      activities: [{ slug: 'x' }],
    })
    const result = parseBundleText(text)
    expect(result).toMatchObject({
      ok: true,
      bundle: { version: '2026.09.1', subjects: [], interests: [] },
      counts: { levels: 1, subjects: 0, interests: 0, skills: 2, activities: 1 },
    })
  })

  it('drops keys the API does not define, so they are never sent', () => {
    const result = parseBundleText('{"version": "1", "dry_run": false, "auto_publish": true, "extra": 1}')
    expect(result.ok && Object.keys(result.bundle).sort()).toEqual(
      ['activities', 'interests', 'levels', 'skills', 'subjects', 'version'],
    )
  })

  it('explains bad input in plain words', () => {
    expect(parseBundleText('{"version": "1",}')).toMatchObject({ ok: false, message: expect.stringContaining('line 1') })
    expect(parseBundleText('{"levels": []}')).toMatchObject({ ok: false, message: expect.stringContaining('"version"') })
    expect(parseBundleText('{"version": "1", "skills": {}}')).toMatchObject({ ok: false, message: expect.stringContaining('"skills"') })
    expect(parseBundleText('{"version": "1", "activities": [1]}')).toMatchObject({ ok: false, message: expect.stringContaining('"activities"') })
    expect(parseBundleText(`{"version": "${'v'.repeat(41)}"}`)).toMatchObject({ ok: false, message: expect.stringContaining('40') })
  })
})

describe('report rows', () => {
  const report = {
    dry_run: true,
    ok: true,
    problems: [],
    created: { activities: 3, skills: 1 },
    updated: { activities: 2 },
    unchanged: { levels: 5, activities: 10, widgets: 1 },
  }

  it('lists the known entities first, then any the server adds, with zeros filled in', () => {
    const rows = reportRows(report)
    expect(rows.map((r) => r.entity)).toEqual(['levels', 'subjects', 'interests', 'skills', 'activities', 'widgets'])
    expect(rows.find((r) => r.entity === 'activities')).toEqual({ entity: 'activities', created: 3, updated: 2, unchanged: 10 })
    expect(rows.find((r) => r.entity === 'subjects')).toEqual({ entity: 'subjects', created: 0, updated: 0, unchanged: 0 })
  })

  it('totals the columns', () => {
    expect(reportTotals(reportRows(report))).toEqual({ created: 4, updated: 2, unchanged: 16 })
  })
})
