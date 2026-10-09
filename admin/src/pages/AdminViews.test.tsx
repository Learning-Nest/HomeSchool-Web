import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  activitySummary,
  apiError,
  educatorSummary,
  eventFixture,
  json,
  makeClient,
  storedSession,
  type Handler,
} from '../test/fakeApi'
import { renderApp } from '../test/renderApp'

const admin = (role = 'content_admin') => ({ session: storedSession(1, Date.now() + 900_000, role) })

describe('EducatorsPage', () => {
  const list = () => json(200, [educatorSummary(), educatorSummary({ id: 'e2', full_name: 'Dan Disabled', email: 'dan@example.com', active: false })])

  it('lists educators with their counts and links to their pages', async () => {
    const { client } = makeClient({ 'GET /v1/admin/educators': list }, admin())
    renderApp(client, '/educators')
    const link = await screen.findByRole('link', { name: 'Eve Educator' })
    expect(link.getAttribute('href')).toBe('/educators/e1')
    expect(screen.getByText('Disabled')).toBeTruthy()
    // only a super admin invites or disables people
    expect(screen.queryByRole('button', { name: 'Send invitation' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Disable/ })).toBeNull()
  })

  it('lets a super admin invite an educator and says the email was sent', async () => {
    const { client, calls } = makeClient(
      {
        'GET /v1/admin/educators': list,
        'POST /v1/admin/educators': () => json(201, { educator: educatorSummary(), existing_account: false, email_sent: true }),
      },
      admin('super_admin'),
    )
    renderApp(client, '/educators')
    fireEvent.change(await screen.findByLabelText('Full name'), { target: { value: ' Eve Educator ' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'eve@example.com ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }))

    expect((await screen.findByText(/Invitation sent to Eve Educator/)).textContent).toContain('7 days')
    const post = calls.find((c) => c.method === 'POST')
    expect(post?.body).toEqual({ email: 'eve@example.com', full_name: 'Eve Educator' })
    // never shows or repeats a password
    expect(document.body.textContent).not.toMatch(/temporary password:\s*\S+/i)
  })

  it('tells the super admin when the invitation email could not be sent', async () => {
    const { client } = makeClient(
      {
        'GET /v1/admin/educators': list,
        'POST /v1/admin/educators': () => json(201, { educator: educatorSummary(), existing_account: false, email_sent: false }),
      },
      admin('super_admin'),
    )
    renderApp(client, '/educators')
    fireEvent.change(await screen.findByLabelText('Full name'), { target: { value: 'Eve' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'eve@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }))
    expect((await screen.findByRole('status')).textContent).toContain('could not be sent')
  })

  it('asks before disabling someone and then disables them', async () => {
    let patched: unknown
    const { client } = makeClient(
      {
        'GET /v1/admin/educators': list,
        'PATCH /v1/admin/educators/e1': (call) => {
          patched = call.body
          return json(200, educatorSummary({ active: false }))
        },
      },
      admin('super_admin'),
    )
    renderApp(client, '/educators')
    fireEvent.click(await screen.findByRole('button', { name: /Disable\s*Eve Educator/ }))
    const dialog = await screen.findByRole('dialog')
    expect(patched).toBeUndefined()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disable' }))
    await waitFor(() => expect(patched).toEqual({ active: false }))
  })

  it('sends an educator who types the address away from the admin pages', async () => {
    const { client, calls } = makeClient({ 'GET /v1/admin/activities': () => json(200, []) }, admin('educator'))
    const { router } = renderApp(client, '/educators')
    await waitFor(() => expect(router.state.location.pathname).toBe('/activities'))
    expect(calls.some((c) => c.path === '/v1/admin/educators')).toBe(false)
  })
})

describe('EducatorDetailPage', () => {
  const detail = (call: { query: URLSearchParams }) =>
    json(200, {
      educator: educatorSummary(),
      activities: [activitySummary({ created_at: '2026-08-20T10:00:00Z', last_edited_by_name: 'Eve Educator', last_edited_at: '2026-09-01T10:00:00Z' })],
      events: call.query.get('from') ? [] : [eventFixture({ action: 'returned', detail: { note: 'Needs a picture' } })],
    })

  it('shows totals, their activities and a dated timeline', async () => {
    const { client } = makeClient({ 'GET /v1/admin/educators/e1/activity': detail }, admin())
    renderApp(client, '/educators/e1')
    expect(await screen.findByRole('heading', { name: 'Eve Educator' })).toBeTruthy()
    expect(screen.getByText('Sent for review').closest('div')?.textContent).toContain('2')
    expect(within(screen.getByRole('region', { name: 'Activities by this educator' })).getByRole('link', { name: 'Count to ten' })).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Timeline' })).getByText('Note: Needs a picture')).toBeTruthy()
  })

  it('asks the server for just the chosen dates', async () => {
    const { client, calls } = makeClient({ 'GET /v1/admin/educators/e1/activity': detail }, admin())
    renderApp(client, '/educators/e1')
    fireEvent.change(await screen.findByLabelText('From'), { target: { value: '2026-09-01' } })
    expect(await screen.findByText('Nothing happened in this period.')).toBeTruthy()
    expect(calls.filter((c) => c.path.endsWith('/activity')).at(-1)?.query.get('from')).toBe('2026-09-01')
  })

  it('explains an unknown educator', async () => {
    const { client } = makeClient({ 'GET /v1/admin/educators/zzz/activity': () => apiError(404, 'not_found') }, admin())
    renderApp(client, '/educators/zzz')
    expect(await screen.findByText('This educator does not exist.')).toBeTruthy()
  })
})

describe('ActivityLogPage', () => {
  const log: Handler = (call) =>
    json(200, [eventFixture({ id: 'x1' }), eventFixture({ id: 'x2', action: 'published', actor_name: 'Ada Admin', version: 2 })].filter(
      (e) => !call.query.get('action') || e.action === call.query.get('action'),
    ))

  it('shows who did what to which activity', async () => {
    const { client } = makeClient({ 'GET /v1/admin/activity-log': log, 'GET /v1/admin/educators': () => json(200, [educatorSummary()]) }, admin())
    renderApp(client, '/activity-log')
    const table = await screen.findByRole('region', { name: 'Activity log' })
    expect(within(table).getByText('Eve Educator')).toBeTruthy()
    expect(within(table).getByText('Ada Admin')).toBeTruthy()
    expect(within(table).getByText('Live as version 2')).toBeTruthy()
  })

  it('filters by the kind of event and by person, and can clear the filters', async () => {
    const { client, calls } = makeClient({ 'GET /v1/admin/activity-log': log, 'GET /v1/admin/educators': () => json(200, [educatorSummary()]) }, admin())
    renderApp(client, '/activity-log')
    await screen.findByRole('region', { name: 'Activity log' })
    fireEvent.change(screen.getByLabelText('What'), { target: { value: 'published' } })
    await waitFor(() => expect(screen.queryByText('Waiting for a reviewer')).toBeNull())
    fireEvent.change(screen.getByLabelText('Who'), { target: { value: 'e1' } })
    await waitFor(() => expect(calls.filter((c) => c.path.endsWith('/activity-log')).at(-1)?.query.get('actor_id')).toBe('e1'))
    const last = calls.filter((c) => c.path.endsWith('/activity-log')).at(-1)
    expect(last?.query.get('action')).toBe('published')
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await screen.findByText('Waiting for a reviewer')).toBeTruthy()
  })

  it('says so when nothing matches', async () => {
    const { client } = makeClient({ 'GET /v1/admin/activity-log': () => json(200, []), 'GET /v1/admin/educators': () => json(200, []) }, admin())
    renderApp(client, '/activity-log?action=archived')
    expect(await screen.findByText('Nothing matches these filters.')).toBeTruthy()
  })

  it('pages through long logs 50 at a time', async () => {
    const many = Array.from({ length: 51 }, (_, i) => eventFixture({ id: `p${i}`, activity_title: `Activity ${i}` }))
    const { client, calls } = makeClient({ 'GET /v1/admin/activity-log': () => json(200, many), 'GET /v1/admin/educators': () => json(200, []) }, admin())
    renderApp(client, '/activity-log')
    await screen.findByRole('region', { name: 'Activity log' })
    expect(screen.queryByText('Activity 50')).toBeNull()
    expect(calls.find((c) => c.path.endsWith('/activity-log'))?.query.get('limit')).toBe('51')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByText('Page 2')).toBeTruthy())
    expect(calls.filter((c) => c.path.endsWith('/activity-log')).at(-1)?.query.get('offset')).toBe('50')
  })

  it('downloads the log as CSV with the current filters', async () => {
    const { client, calls } = makeClient(
      {
        'GET /v1/admin/activity-log': (call) =>
          call.query.get('format') === 'csv' ? new Response('a,b\n1,2\n', { status: 200, headers: { 'Content-Type': 'text/csv' } }) : json(200, [eventFixture()]),
        'GET /v1/admin/educators': () => json(200, []),
      },
      admin(),
    )
    const urls: Blob[] = []
    const original = URL.createObjectURL
    URL.createObjectURL = (b: Blob | MediaSource) => (urls.push(b as Blob), 'blob:test')
    URL.revokeObjectURL = () => undefined
    try {
      renderApp(client, '/activity-log?action=submitted')
      fireEvent.click(await screen.findByRole('button', { name: 'Download CSV' }))
      await waitFor(() => expect(urls).toHaveLength(1))
      const csv = calls.find((c) => c.query.get('format') === 'csv')
      expect(csv?.query.get('action')).toBe('submitted')
      expect(await urls[0]?.text()).toBe('a,b\n1,2\n')
    } finally {
      URL.createObjectURL = original
    }
  })
})

describe('ReviewPage', () => {
  it('lists activities waiting for review, oldest first, with who added them', async () => {
    const { client, calls } = makeClient(
      {
        'GET /v1/admin/activities': () =>
          json(200, [
            activitySummary({ id: 'n', title: 'Newer', status: 'in_review', submitted_at: '2026-09-03T10:00:00Z', created_by_name: 'Eve Educator', is_validated: true }),
            activitySummary({ id: 'o', title: 'Older', status: 'in_review', submitted_at: '2026-09-01T10:00:00Z', created_by_name: 'Dan Educator', is_validated: false }),
          ]),
      },
      admin(),
    )
    renderApp(client, '/review')
    const table = await screen.findByRole('region', { name: 'Activities waiting for review' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows[0]?.textContent).toContain('Older')
    expect(rows[0]?.textContent).toContain('Dan Educator')
    expect(rows[0]?.textContent).toContain('Not since the last edit')
    expect(rows[1]?.textContent).toContain('Newer')
    expect(calls[0]?.query.get('status')).toBe('in_review')
  })

  it('says when the queue is empty', async () => {
    const { client } = makeClient({ 'GET /v1/admin/activities': () => json(200, []) }, admin())
    renderApp(client, '/review')
    expect(await screen.findByText('Nothing is waiting for review.')).toBeTruthy()
  })
})
