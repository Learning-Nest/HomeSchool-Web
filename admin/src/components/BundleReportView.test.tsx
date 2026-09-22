import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { BundleReport } from '../api/types'
import { BundleReportView } from './BundleReportView'

const base: BundleReport = {
  dry_run: true,
  ok: true,
  problems: [],
  created: { levels: 0, subjects: 0, interests: 0, skills: 2, activities: 15 },
  updated: { levels: 0, subjects: 0, interests: 0, skills: 0, activities: 1 },
  unchanged: { levels: 5, subjects: 8, interests: 12, skills: 49, activities: 0 },
}

function cellsOf(row: string) {
  return within(screen.getByRole('row', { name: new RegExp(`^${row}`) }))
    .getAllByRole('cell')
    .map((c) => c.textContent)
}

describe('BundleReportView', () => {
  it('shows created, updated and unchanged per entity plus totals for a clean dry run', () => {
    render(<BundleReportView report={base} heading="Dry-run result" />)

    expect(screen.getByText('No problems found. Nothing has been saved yet.')).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Would create' })).toBeTruthy()
    expect(cellsOf('activities')).toEqual(['15', '1', '0'])
    expect(cellsOf('skills')).toEqual(['2', '0', '49'])
    expect(cellsOf('Total')).toEqual(['17', '1', '74'])
    expect(screen.queryByRole('list', { name: 'Problems' })).toBeNull()
  })

  it('lists every problem and says nothing was saved', () => {
    const report = { ...base, ok: false, problems: ['activity x: unknown skill A.B.C', 'skill Q: unknown subject "ZZZ"'] }
    render(<BundleReportView report={report} heading="Dry-run result" />)

    expect(screen.getByText('2 problems found. Nothing was saved.')).toBeTruthy()
    const items = within(screen.getByRole('list', { name: 'Problems' })).getAllByRole('listitem')
    expect(items.map((i) => i.textContent)).toEqual(['activity x: unknown skill A.B.C', 'skill Q: unknown subject "ZZZ"'])
  })

  it('uses past tense once the import has been applied', () => {
    render(<BundleReportView report={{ ...base, dry_run: false }} heading="Import result" />)

    expect(screen.getByText('Import complete.')).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Created' })).toBeTruthy()
    expect(screen.queryByRole('columnheader', { name: 'Would create' })).toBeNull()
  })

  it('uses the singular for one problem', () => {
    render(<BundleReportView report={{ ...base, ok: false, problems: ['only one'] }} heading="Dry-run result" />)
    expect(screen.getByText('1 problem found. Nothing was saved.')).toBeTruthy()
  })
})
