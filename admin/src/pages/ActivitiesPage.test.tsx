import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { activitySummary, json, makeClient } from '../test/fakeApi'
import { renderApp } from '../test/renderApp'

const summary = (n: number, status = 'draft') =>
  activitySummary({ id: `id-${n}`, slug: `act-${n}`, title: `Activity ${n}`, status })

const subjects = [
  { code: 'MAT', name: 'Mathematics', display_order: 2 },
  { code: 'ENG', name: 'English', display_order: 1 },
]

describe('activities list', () => {
  it('sends the filters from the address and shows the table columns', async () => {
    const { client, calls } = makeClient({
      'GET /v1/admin/activities': () => json(200, [summary(1, 'published')]),
      'GET /v1/curriculum/subjects': () => json(200, subjects),
    })
    renderApp(client, '/activities?status=published&subject=MAT&q=count')

    const table = await screen.findByRole('table')
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(['Title', 'Subject', 'Levels', 'Duration', 'Status', 'Version', 'Updated'])
    const row = within(table).getAllByRole('row')[1]!
    expect(within(row).getByRole('link', { name: 'Activity 1' }).getAttribute('href')).toBe('/activities/id-1')
    expect(row.textContent).toContain('L1–L2')
    expect(row.textContent).toContain('15 min')
    expect(row.textContent).toContain('Published')

    const call = calls.find((c) => c.path === '/v1/admin/activities')!
    expect(Object.fromEntries(call.query)).toEqual({ status: 'published', subject: 'MAT', q: 'count', limit: '26', offset: '0' })
  })

  it('pages by asking for one extra row', async () => {
    const twentySix = Array.from({ length: 26 }, (_, i) => summary(i + 1))
    const { client, calls } = makeClient({
      'GET /v1/admin/activities': ({ query }) => json(200, query.get('offset') === '0' ? twentySix : [summary(27)]),
      'GET /v1/curriculum/subjects': () => json(200, subjects),
    })
    renderApp(client, '/activities')

    await screen.findByText('Activity 25')
    expect(screen.queryByText('Activity 26')).toBeNull()
    expect((screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('Activity 27')
    expect(calls.at(-1)?.query.get('offset')).not.toBe('0')
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('distinguishes an empty catalogue from an empty filter result', async () => {
    const { client } = makeClient({
      'GET /v1/admin/activities': () => json(200, []),
      'GET /v1/curriculum/subjects': () => json(200, subjects),
    })
    renderApp(client, '/activities?status=archived')
    expect(await screen.findByText('No activities match these filters.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeTruthy()
  })

  it('applies a text search from the form', async () => {
    const { client, calls } = makeClient({
      'GET /v1/admin/activities': () => json(200, []),
      'GET /v1/curriculum/subjects': () => json(200, subjects),
    })
    renderApp(client, '/activities')
    fireEvent.change(await screen.findByLabelText('Search title or slug'), { target: { value: ' rocket ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    await screen.findByRole('button', { name: 'Clear filters' })
    await waitFor(() => expect(calls.at(-1)?.query.get('q')).toBe('rocket'))
  })
})
