import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  activityDetail,
  apiError,
  assignmentFixture,
  builderDetail,
  educatorSummary,
  json,
  levelsFixture,
  makeClient,
  skillsFixture,
  storedSession,
  subjectsFixture,
} from '../test/fakeApi'
import { renderApp } from '../test/renderApp'

const as = (role: string) => ({ session: storedSession(1, Date.now() + 900_000, role) })
const educators = () => json(200, [educatorSummary(), educatorSummary({ id: 'e2', full_name: 'Dan Disabled', email: 'dan@example.com', active: false })])

describe('assigning a draft (admin, on the activity page)', () => {
  const base = {
    'GET /v1/admin/activities/a1': () => json(200, activityDetail()),
    'GET /v1/admin/educators': educators,
    'GET /v1/admin/activity-log': () => json(200, []),
    'GET /v1/admin/activities/a1/assets': () => json(200, []),
  }

  it('asks for an educator and a brief, then assigns and says the email went out', async () => {
    let posted: unknown
    const { client } = makeClient(
      {
        ...base,
        'GET /v1/admin/assignments': () => json(200, []),
        'POST /v1/admin/activities/a1/assignments': (call) => {
          posted = call.body
          return json(201, { assignment: assignmentFixture(), email_sent: true })
        },
      },
      as('content_admin'),
    )
    renderApp(client, '/activities/a1')
    fireEvent.click(await screen.findByRole('button', { name: 'Assign to an educator…' }))

    const confirm = screen.getByRole('button', { name: 'Assign' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true) // nothing chosen or written yet
    const select = await screen.findByLabelText('Educator')
    await waitFor(() => expect(within(select).getByRole('option', { name: /Eve Educator/ })).toBeTruthy())
    expect(within(select).queryByRole('option', { name: /Dan Disabled/ })).toBeNull() // disabled people are not offered
    fireEvent.change(select, { target: { value: 'e1' } })
    expect(confirm.disabled).toBe(true) // still no brief
    fireEvent.change(screen.getByLabelText('What is needed'), { target: { value: '  Write six exercises on counting to 20.  ' } })
    fireEvent.change(screen.getByLabelText('Due date (optional)'), { target: { value: '2099-12-31' } })
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)

    expect((await screen.findByText(/They have been emailed the brief/)).textContent).toContain('Eve Educator')
    expect(posted).toEqual({ educator_id: 'e1', requirements: 'Write six exercises on counting to 20.', due_date: '2099-12-31' })
  })

  it('warns when the email could not be sent', async () => {
    const { client } = makeClient(
      {
        ...base,
        'GET /v1/admin/assignments': () => json(200, []),
        'POST /v1/admin/activities/a1/assignments': () => json(201, { assignment: assignmentFixture(), email_sent: false }),
      },
      as('content_admin'),
    )
    renderApp(client, '/activities/a1')
    fireEvent.click(await screen.findByRole('button', { name: 'Assign to an educator…' }))
    const select = await screen.findByLabelText('Educator')
    await waitFor(() => expect(within(select).getByRole('option', { name: /Eve Educator/ })).toBeTruthy())
    fireEvent.change(select, { target: { value: 'e1' } })
    fireEvent.change(screen.getByLabelText('What is needed'), { target: { value: 'Do it' } })
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }))
    expect((await screen.findByText(/email could not be sent/)).textContent).toContain('My assignments')
  })

  it('shows the server’s reason when the assignment is refused', async () => {
    const { client } = makeClient(
      {
        ...base,
        'GET /v1/admin/assignments': () => json(200, []),
        'POST /v1/admin/activities/a1/assignments': () => apiError(409, 'conflict'),
      },
      as('content_admin'),
    )
    renderApp(client, '/activities/a1')
    fireEvent.click(await screen.findByRole('button', { name: 'Assign to an educator…' }))
    const select = await screen.findByLabelText('Educator')
    await waitFor(() => expect(within(select).getByRole('option', { name: /Eve Educator/ })).toBeTruthy())
    fireEvent.change(select, { target: { value: 'e1' } })
    fireEvent.change(screen.getByLabelText('What is needed'), { target: { value: 'Do it' } })
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Assign' }) as HTMLButtonElement).disabled).toBe(false) // can try again
  })

  it('shows who holds the draft and lets the admin cancel the assignment', async () => {
    let cancelled = false
    const { client } = makeClient(
      {
        ...base,
        'GET /v1/admin/assignments': () => json(200, cancelled ? [] : [assignmentFixture()]),
        'POST /v1/admin/assignments/as1/cancel': () => {
          cancelled = true
          return json(200, assignmentFixture({ status: 'cancelled' }))
        },
      },
      as('content_admin'),
    )
    renderApp(client, '/activities/a1')
    const panel = await screen.findByRole('region', { name: 'Assignment' })
    await within(panel).findByText('Eve Educator')
    expect(within(panel).getByText('Write six exercises on counting to 20.')).toBeTruthy()
    fireEvent.click(within(panel).getByRole('button', { name: 'Cancel assignment' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel assignment' }))
    expect(await screen.findByText(/no longer has access/)).toBeTruthy()
    expect(cancelled).toBe(true)
  })

  it('does not offer assignment for an activity that is no longer a draft', async () => {
    const { client } = makeClient(
      { ...base, 'GET /v1/admin/activities/a1': () => json(200, activityDetail({ status: 'published' })), 'GET /v1/admin/assignments': () => json(200, []) },
      as('content_admin'),
    )
    renderApp(client, '/activities/a1')
    await screen.findByRole('heading', { name: 'Count to ten', level: 1 })
    expect(screen.queryByRole('button', { name: 'Assign to an educator…' })).toBeNull()
  })
})

describe('My assignments (educator)', () => {
  it('groups the work by what to do next and shows the brief and any reviewer note', async () => {
    const { client, calls } = makeClient(
      {
        'GET /v1/admin/assignments': () =>
          json(200, [
            assignmentFixture({ id: 'x1', activity_title: 'Counting socks', review_note: 'Add a hint to s2.' }),
            assignmentFixture({ id: 'x2', activity_title: 'Shapes', status: 'submitted', requirements: 'Shapes brief' }),
            assignmentFixture({ id: 'x3', activity_title: 'Old one', status: 'completed', requirements: 'Done' }),
            assignmentFixture({ id: 'x4', activity_title: 'Late one', overdue: true, requirements: 'Late' }),
          ]),
      },
      as('educator'),
    )
    renderApp(client, '/assignments')
    await screen.findByRole('heading', { name: 'My assignments', level: 1 })
    const todo = await screen.findByRole('region', { name: 'To do' })
    expect(within(todo).getByRole('link', { name: 'Counting socks' }).getAttribute('href')).toBe('/activities/a1')
    expect(within(todo).getByText(/Add a hint to s2/)).toBeTruthy()
    expect(within(todo).getByText('Overdue')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Sent for review' })).getByText('Shapes brief')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Finished' })).getByText('Done')).toBeTruthy()
    // educators never ask for other people's work
    expect(calls.every((c) => !c.query.has('educator_id'))).toBe(true)
    // the nav entry is named for them
    expect(screen.getByRole('link', { name: 'My assignments' })).toBeTruthy()
  })

  it('says so when nothing has been assigned', async () => {
    const { client } = makeClient({ 'GET /v1/admin/assignments': () => json(200, []) }, as('educator'))
    renderApp(client, '/assignments')
    expect(await screen.findByText('Nothing has been assigned to you yet.')).toBeTruthy()
  })
})

describe('Assignments (admin tracking)', () => {
  const rows = () => [
    assignmentFixture({ id: 'p1', activity_title: 'Counting socks' }),
    assignmentFixture({ id: 'p2', activity_title: 'Shapes', educator_id: 'e2', educator_name: 'Dan Doe', overdue: true, due_date: '2020-01-01' }),
    assignmentFixture({ id: 'p3', activity_title: 'Waiting one', status: 'submitted', activity_status: 'in_review' }),
    assignmentFixture({ id: 'p4', activity_title: 'Done one', status: 'completed' }),
  ]

  it('counts the work per educator and lists the live assignments first', async () => {
    const { client } = makeClient({ 'GET /v1/admin/assignments': () => json(200, rows()) }, as('content_admin'))
    renderApp(client, '/assignments')
    const summary = await screen.findByRole('region', { name: 'Assignments per educator' })
    const eve = within(summary).getByRole('link', { name: 'Eve Educator' }).closest('tr') as HTMLElement
    expect(within(eve).getAllByRole('cell').map((c) => c.textContent)).toEqual(['1', '0', '1', '1']) // with them, overdue, review, done
    const table = screen.getByRole('region', { name: 'Assignments' })
    expect(within(table).getByText('Counting socks')).toBeTruthy()
    expect(within(table).queryByText('Done one')).toBeNull() // completed work is under its own filter
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'overdue' } })
    expect(within(screen.getByRole('region', { name: 'Assignments' })).getAllByRole('row')).toHaveLength(2) // header + Shapes
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'completed' } })
    expect(within(screen.getByRole('region', { name: 'Assignments' })).getByText('Done one')).toBeTruthy()
  })

  it('filters by educator', async () => {
    const { client } = makeClient({ 'GET /v1/admin/assignments': () => json(200, rows()) }, as('content_admin'))
    renderApp(client, '/assignments')
    await screen.findByRole('region', { name: 'Assignments' })
    fireEvent.change(screen.getByLabelText('Educator'), { target: { value: 'e2' } })
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'all' } })
    const table = screen.getByRole('region', { name: 'Assignments' })
    expect(within(table).getByText('Shapes')).toBeTruthy()
    expect(within(table).queryByText('Counting socks')).toBeNull()
  })

  it('edits a brief and cancels an assignment from the table', async () => {
    let patched: unknown
    let cancelled = false
    const { client } = makeClient(
      {
        'GET /v1/admin/assignments': () => json(200, rows()),
        'PATCH /v1/admin/assignments/p1': (call) => {
          patched = call.body
          return json(200, assignmentFixture({ id: 'p1', requirements: 'New words' }))
        },
        'POST /v1/admin/assignments/p3/cancel': () => {
          cancelled = true
          return json(200, assignmentFixture({ id: 'p3', status: 'cancelled' }))
        },
      },
      as('content_admin'),
    )
    renderApp(client, '/assignments')
    await screen.findByRole('region', { name: 'Assignments' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit brief for Counting socks' }))
    fireEvent.change(await screen.findByLabelText('What is needed'), { target: { value: 'New words' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Assignment updated.')).toBeTruthy()
    expect(patched).toEqual({ requirements: 'New words', due_date: '2099-12-31' })

    // an assignment that is already in review cannot be reassigned (the draft is locked), only cancelled
    expect(screen.queryByRole('button', { name: 'Reassign Waiting one' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel assignment of Waiting one' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel assignment' }))
    expect(await screen.findByText(/Cancelled the assignment of “Waiting one”/)).toBeTruthy()
    expect(cancelled).toBe(true)
  })
})

describe('the brief in the builder (educator)', () => {
  it('shows what the admin asked for above an assigned draft', async () => {
    const { client } = makeClient(
      {
        'GET /v1/admin/activities/a1': () => json(200, builderDetail({ assignment_id: 'as1', assigned_to: 'e1' })),
        'GET /v1/admin/assignments/as1': () => json(200, assignmentFixture()),
        'GET /v1/curriculum/subjects': () => json(200, subjectsFixture),
        'GET /v1/curriculum/levels': () => json(200, levelsFixture),
        'GET /v1/curriculum/skills': () => json(200, skillsFixture),
        'GET /v1/admin/activities/a1/assets': () => json(200, []),
        'GET /v1/admin/activities/a1/lessons': () => json(200, []),
        'GET /v1/curriculum/boards': () => json(200, []),
      },
      as('educator'),
    )
    renderApp(client, '/activities/a1/build')
    expect(await screen.findByText('Write six exercises on counting to 20.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: /What Ed Itor asked for/ })).toBeTruthy()
  })
})
