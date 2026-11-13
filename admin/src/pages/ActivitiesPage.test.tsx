import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { activitySummary, educatorSummary, json, levelsFixture, makeClient, storedSession } from '../test/fakeApi'
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
      'GET /v1/curriculum/levels': () => json(200, levelsFixture),
    })
    renderApp(client, '/activities?status=published&subject=MAT&q=count&level=L2')

    const table = await screen.findByRole('table')
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(['', 'Title', 'Subject', 'Levels', 'Duration', 'Status', 'Version', 'Added by', 'Last edited'])
    const row = within(table).getAllByRole('row')[1]!
    expect(within(row).getByRole('link', { name: 'Activity 1' }).getAttribute('href')).toBe('/activities/id-1')
    expect(row.textContent).toContain('L1–L2')
    expect(row.textContent).toContain('15 min')
    expect(row.textContent).toContain('Published')

    const call = calls.find((c) => c.path === '/v1/admin/activities')!
    expect(Object.fromEntries(call.query)).toEqual({ status: 'published', subject: 'MAT', q: 'count', level: 'L2', limit: '51', offset: '0' })
  })

  it('pages by asking for one extra row', async () => {
    const fiftyOne = Array.from({ length: 51 }, (_, i) => summary(i + 1))
    const { client, calls } = makeClient({
      'GET /v1/admin/activities': ({ query }) => json(200, query.get('offset') === '0' ? fiftyOne : [summary(52)]),
      'GET /v1/curriculum/subjects': () => json(200, subjects),
      'GET /v1/curriculum/levels': () => json(200, levelsFixture),
    })
    renderApp(client, '/activities')

    await screen.findByText('Activity 50')
    expect(screen.queryByText('Activity 51')).toBeNull()
    expect((screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('Activity 52')
    expect(calls.at(-1)?.query.get('offset')).not.toBe('0')
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('distinguishes an empty catalogue from an empty filter result', async () => {
    const { client } = makeClient({
      'GET /v1/admin/activities': () => json(200, []),
      'GET /v1/curriculum/subjects': () => json(200, subjects),
      'GET /v1/curriculum/levels': () => json(200, levelsFixture),
    })
    renderApp(client, '/activities?status=archived')
    expect(await screen.findByText('No activities match these filters.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeTruthy()
  })

  it('applies a text search from the form', async () => {
    const { client, calls } = makeClient({
      'GET /v1/admin/activities': () => json(200, []),
      'GET /v1/curriculum/subjects': () => json(200, subjects),
      'GET /v1/curriculum/levels': () => json(200, levelsFixture),
    })
    renderApp(client, '/activities')
    fireEvent.change(await screen.findByLabelText('Search title or slug'), { target: { value: ' rocket ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    await screen.findByRole('button', { name: 'Clear filters' })
    await waitFor(() => expect(calls.at(-1)?.query.get('q')).toBe('rocket'))
  })

  it('filters by level using the level list and keeps it in the address', async () => {
    const { client, calls } = makeClient({
      'GET /v1/admin/activities': () => json(200, []),
      'GET /v1/curriculum/subjects': () => json(200, subjects),
      'GET /v1/curriculum/levels': () => json(200, levelsFixture),
    })
    renderApp(client, '/activities')
    const select = (await screen.findByLabelText('Level')) as HTMLSelectElement
    await waitFor(() => expect(within(select).getByRole('option', { name: /L3/ })).toBeTruthy())
    expect(within(select).getAllByRole('option')[0]!.textContent).toBe('All levels')
    fireEvent.change(select, { target: { value: 'L3' } })
    await waitFor(() => expect(calls.at(-1)?.query.get('level')).toBe('L3'))
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeTruthy()
  })

  it('offers 50, 100, 200, 500 and 1000 rows per page and asks for one extra row to detect a next page', async () => {
    const { client, calls } = makeClient({
      'GET /v1/admin/activities': () => json(200, []),
      'GET /v1/curriculum/subjects': () => json(200, subjects),
      'GET /v1/curriculum/levels': () => json(200, levelsFixture),
    })
    renderApp(client, '/activities')
    const size = (await screen.findByLabelText('Rows per page')) as HTMLSelectElement
    expect(within(size).getAllByRole('option').map((o) => o.textContent)).toEqual(['50', '100', '200', '500', '1000'])
    expect(size.value).toBe('50')
    const lastList = () => calls.filter((c) => c.path === '/v1/admin/activities').at(-1)
    expect(lastList()?.query.get('limit')).toBe('51')
    fireEvent.change(size, { target: { value: '500' } })
    await waitFor(() => expect(lastList()?.query.get('limit')).toBe('501'))
    fireEvent.change(size, { target: { value: '1000' } })
    await waitFor(() => expect(lastList()?.query.get('limit')).toBe('1001'))
    expect(lastList()?.query.get('offset')).toBe('0')
  })

  it('ignores a page size that is not on the list', async () => {
    const { client, calls } = makeClient({
      'GET /v1/admin/activities': () => json(200, []),
      'GET /v1/curriculum/subjects': () => json(200, subjects),
      'GET /v1/curriculum/levels': () => json(200, levelsFixture),
    })
    renderApp(client, '/activities?size=7')
    await screen.findByLabelText('Rows per page')
    expect(calls.find((c) => c.path === '/v1/admin/activities')?.query.get('limit')).toBe('51')
  })
})

describe('assigning activities in bulk', () => {
  const rowsFor = () => [
    summary(1),
    summary(2),
    summary(3, 'published'),
    summary(4),
  ]
  const handlers = (extra: Record<string, (call: never) => Response> = {}) => ({
    'GET /v1/admin/activities': () => json(200, rowsFor()),
    'GET /v1/curriculum/subjects': () => json(200, subjects),
    'GET /v1/curriculum/levels': () => json(200, levelsFixture),
    'GET /v1/admin/educators': () => json(200, [educatorSummary(), educatorSummary({ id: 'e2', full_name: 'Dan Disabled', email: 'dan@example.com', active: false })]),
    ...extra,
  })

  it('selects every draft on the page, skips non-drafts, and sends one request with the shared brief and due date', async () => {
    let posted: unknown
    const { client } = makeClient(
      handlers({
        'POST /v1/admin/assignments/bulk': ((call: { body: unknown }) => {
          posted = call.body
          return json(200, { assigned: 3, skipped: [], email_sent: true })
        }) as never,
      }),
    )
    renderApp(client, '/activities')
    await screen.findByText('Activity 1')
    const assignButton = screen.getByRole('button', { name: 'Assign to an educator…' }) as HTMLButtonElement
    expect(assignButton.disabled).toBe(true)

    fireEvent.click(screen.getByLabelText('Select all drafts on this page'))
    expect(screen.getByText('3 drafts selected')).toBeTruthy()
    const published = screen.getByLabelText(/Activity 3 is not a draft/) as HTMLInputElement
    expect(published.disabled).toBe(true)
    expect(published.checked).toBe(false)
    expect(assignButton.disabled).toBe(false)

    fireEvent.click(screen.getByLabelText('Select Activity 2')) // untick one
    expect(screen.getByText('2 drafts selected')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Select Activity 2'))
    expect(screen.getByText('3 drafts selected')).toBeTruthy()

    fireEvent.click(assignButton)
    const confirm = screen.getByRole('button', { name: 'Assign 3' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    const select = await screen.findByLabelText('Educator')
    await waitFor(() => expect(within(select).getByRole('option', { name: /Eve Educator/ })).toBeTruthy())
    expect(within(select).queryByRole('option', { name: /Dan Disabled/ })).toBeNull()
    fireEvent.change(select, { target: { value: 'e1' } })
    fireEvent.change(screen.getByLabelText('What is needed'), { target: { value: '  Six exercises on counting.  ' } })
    fireEvent.change(screen.getByLabelText('Due date (optional)'), { target: { value: '2099-12-31' } })
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)

    expect((await screen.findByText(/3 activities assigned to Eve Educator\./)).textContent).toContain('one email')
    expect(posted).toEqual({
      activity_ids: ['id-1', 'id-2', 'id-4'],
      educator_id: 'e1',
      requirements: 'Six exercises on counting.',
      due_date: '2099-12-31',
    })
    expect(screen.queryByText(/drafts selected/)).toBeNull() // the selection is cleared afterwards
  })

  it('reports what was skipped and when the email could not be sent', async () => {
    const { client } = makeClient(
      handlers({
        'POST /v1/admin/assignments/bulk': (() =>
          json(200, {
            assigned: 1,
            skipped: [{ activity_id: 'id-2', title: 'Activity 2', reason: 'already_assigned' }],
            email_sent: false,
          })) as never,
      }),
    )
    renderApp(client, '/activities')
    await screen.findByText('Activity 1')
    fireEvent.click(screen.getByLabelText('Select Activity 1'))
    expect(screen.getByText('1 draft selected')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Assign to an educator…' }))
    const select = await screen.findByLabelText('Educator')
    await waitFor(() => expect(within(select).getByRole('option', { name: /Eve Educator/ })).toBeTruthy())
    fireEvent.change(select, { target: { value: 'e1' } })
    fireEvent.change(screen.getByLabelText('What is needed'), { target: { value: 'Do it' } })
    fireEvent.click(screen.getByRole('button', { name: 'Assign 1' }))
    const text = (await screen.findByText(/1 activity assigned to Eve Educator\./)).textContent ?? ''
    expect(text).toContain('email could not be sent')
    expect(text).toContain('1 skipped: was already with this educator')
  })

  it('starts a fresh selection when the filters or page size change', async () => {
    const { client } = makeClient(handlers())
    renderApp(client, '/activities')
    await screen.findByText('Activity 1')
    fireEvent.click(screen.getByLabelText('Select all drafts on this page'))
    expect(screen.getByText('3 drafts selected')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '100' } })
    await waitFor(() => expect(screen.queryByText('3 drafts selected')).toBeNull())
    expect((screen.getByRole('button', { name: 'Assign to an educator…' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('has no selection column for educators', async () => {
    const { client } = makeClient(
      {
        'GET /v1/admin/activities': () => json(200, rowsFor()),
        'GET /v1/curriculum/subjects': () => json(200, subjects),
        'GET /v1/curriculum/levels': () => json(200, levelsFixture),
      },
      { session: storedSession(1, Date.now() + 900_000, 'educator') },
    )
    renderApp(client, '/activities')
    await screen.findByText('Activity 1')
    expect(screen.queryByLabelText('Select all drafts on this page')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Assign to an educator…' })).toBeNull()
  })
})
