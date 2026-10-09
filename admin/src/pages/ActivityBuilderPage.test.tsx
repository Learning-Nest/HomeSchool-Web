import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  assetFixture,
  builderDetail,
  json,
  levelsFixture,
  makeClient,
  skillsFixture,
  storedSession,
  subjectsFixture,
  apiError,
  type Handler,
} from '../test/fakeApi'
import { renderApp } from '../test/renderApp'

const educator = () => ({ session: storedSession(1, Date.now() + 900_000, 'educator') })

function serverFor(detail = builderDetail(), extra: Record<string, Handler> = {}) {
  return {
    'GET /v1/admin/activities/a1': () => json(200, detail),
    'GET /v1/curriculum/subjects': () => json(200, subjectsFixture),
    'GET /v1/curriculum/levels': () => json(200, levelsFixture),
    'GET /v1/curriculum/skills': () => json(200, skillsFixture),
    'GET /v1/admin/activities/a1/assets': () => json(200, [assetFixture()]),
    ...extra,
  }
}

async function open(handlers: Record<string, Handler>) {
  const made = makeClient(handlers, educator())
  const view = renderApp(made.client, '/activities/a1/build')
  await screen.findByRole('heading', { name: 'Count to ten' })
  return { ...made, ...view }
}

describe('ActivityBuilderPage', () => {
  it('shows the activity, who added it and how many exercises it has', async () => {
    await open(serverFor())
    expect(screen.getByRole('heading', { name: /Exercises \(2\)/ })).toBeTruthy()
    expect(screen.getByText(/Added by Eve Educator/)).toBeTruthy()
    expect(screen.getByText('No changes yet.')).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      expect.stringContaining('Exercise 1:'),
      expect.stringContaining('Exercise 2:'),
    ])
  })

  it('saves a half-finished draft by itself, leniently, after the person stops typing', async () => {
    const { calls } = await open(
      serverFor(builderDetail(), {
        'PUT /v1/admin/activities/a1/definition': (call) =>
          json(200, builderDetail({ title: 'Count to twenty', definition: (call.body as { definition: object }).definition })),
      }),
    )
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Count to twenty' } })
    expect(screen.getByText('Unsaved changes…')).toBeTruthy()
    expect(calls.some((c) => c.method === 'PUT')).toBe(false)

    await waitFor(() => expect(screen.getByText(/All changes saved/)).toBeTruthy(), { timeout: 4000 })
    const put = calls.filter((c) => c.method === 'PUT')
    expect(put).toHaveLength(1)
    expect(put[0]?.query.get('strict')).toBe('false')
    expect((put[0]?.body as { definition: { title: string } }).definition.title).toBe('Count to twenty')
  }, 10_000)

  it('keeps the changes and offers a retry when saving fails', async () => {
    await open(serverFor(builderDetail(), { 'PUT /v1/admin/activities/a1/definition': () => apiError(500, 'internal_error') }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Changed' } })
    await waitFor(() => expect(screen.getByText('Your changes are not saved yet.')).toBeTruthy(), { timeout: 4000 })
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Changed')
  }, 10_000)

  it('shows each problem next to its exercise and blocks sending until the check passes', async () => {
    await open(
      serverFor(builderDetail(), {
        'POST /v1/admin/activities/a1/validate': () =>
          json(200, { ok: false, problems: [{ step: 's2', message: 'Mark which choice is correct.' }, { step: null, message: 'Add a summary.' }] }),
      }),
    )
    expect((screen.getByRole('button', { name: 'Send for review' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Check this activity' }))

    expect(await screen.findByText('2 problems to fix')).toBeTruthy()
    expect(screen.getAllByText('Mark which choice is correct.').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Add a summary\./)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Send for review' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Fix the problems below, then check again.')).toBeTruthy()
  })

  it('checks, then sends for review after a confirmation, and then locks the form', async () => {
    const { calls } = await open(
      serverFor(builderDetail(), {
        'POST /v1/admin/activities/a1/validate': () => json(200, { ok: true, problems: [], validated_at: '2026-09-03T10:00:00Z' }),
        'POST /v1/admin/activities/a1/submit': () => json(200, builderDetail({ status: 'in_review' })),
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Check this activity' }))
    expect(await screen.findByText('All checks passed.')).toBeTruthy()

    const send = screen.getByRole('button', { name: 'Send for review' }) as HTMLButtonElement
    expect(send.disabled).toBe(false)
    fireEvent.click(send)
    const dialog = await screen.findByRole('dialog')
    expect(calls.some((c) => c.path.endsWith('/submit'))).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send for review' }))

    expect(await screen.findByText(/Waiting for review/)).toBeTruthy()
    expect(calls.filter((c) => c.path.endsWith('/submit'))).toHaveLength(1)
    expect((screen.getByLabelText('Title') as HTMLInputElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Check this activity' })).toBeNull()
  })

  it('asks for a new check after any change made since the last one', async () => {
    await open(
      serverFor(builderDetail(), {
        'POST /v1/admin/activities/a1/validate': () => json(200, { ok: true, problems: [] }),
        'PUT /v1/admin/activities/a1/definition': (call) =>
          json(200, builderDetail({ definition: (call.body as { definition: object }).definition })),
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Check this activity' }))
    await screen.findByText('All checks passed.')
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Different' } })

    expect(screen.getByText(/You changed something since the last check/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Send for review' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByText('All checks passed.')).toBeNull()
  })

  it('saves unsaved edits first when the person checks straight away', async () => {
    const { calls } = await open(
      serverFor(builderDetail(), {
        'PUT /v1/admin/activities/a1/definition': (call) =>
          json(200, builderDetail({ definition: (call.body as { definition: object }).definition })),
        'POST /v1/admin/activities/a1/validate': () => json(200, { ok: true, problems: [] }),
      }),
    )
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Quick' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check this activity' }))
    await screen.findByText('All checks passed.')
    const order = calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.path}`)
    expect(order).toEqual(['PUT /v1/admin/activities/a1/definition', 'POST /v1/admin/activities/a1/validate'])
  })

  it('changes the number of exercises and confirms before throwing away typed content', async () => {
    await open(serverFor())
    const count = screen.getByLabelText('Number of exercises')
    fireEvent.change(count, { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Set number' }))
    expect(screen.getByRole('heading', { name: /Exercises \(3\)/ })).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Number of exercises'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Set number' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain('deletes the last 2')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove them' }))
    expect(screen.getByRole('heading', { name: /Exercises \(1\)/ })).toBeTruthy()
  })

  it('adds an exercise of the chosen kind and deletes one after confirming', async () => {
    await open(serverFor())
    fireEvent.change(screen.getByLabelText('New exercise'), { target: { value: 'numeric_input' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add exercise' }))
    expect(screen.getByRole('heading', { name: /Exercises \(3\)/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /Exercise 3: .*/ }).textContent).not.toContain('Exercise 3: single')

    fireEvent.click(screen.getByRole('button', { name: /Delete\s*exercise 3/ }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('heading', { name: /Exercises \(2\)/ })).toBeTruthy()
  })

  it('uploads a picture for an exercise and puts it in the activity', async () => {
    const { calls, container } = await open(
      serverFor(builderDetail(), {
        'POST /v1/admin/assets': () => json(201, assetFixture({ id: 'img2', url: 'https://blob.test/img2.png' })),
      }),
    )
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([new Uint8Array([1, 2, 3])], 'apple.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByLabelText(/Describe the picture/)).toBeTruthy()
    const upload = calls.find((c) => c.method === 'POST' && c.path === '/v1/admin/assets')
    expect(upload?.query.get('activity_id')).toBe('a1')
    expect(upload?.headers.get('Content-Type')).toBe('image/png')
  })

  it('refuses a picture of the wrong kind without sending it', async () => {
    const { calls, container } = await open(serverFor())
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'doc.pdf', { type: 'application/pdf' })] } })
    expect(await screen.findByText('Use a JPEG, PNG or WebP picture.')).toBeTruthy()
    expect(calls.some((c) => c.path === '/v1/admin/assets')).toBe(false)
  })

  it('shows the reviewer note when an activity was sent back', async () => {
    await open(
      serverFor(
        builderDetail({ review_note: 'Add a picture to exercise 2.', reviewed_by_name: 'Ada Admin' }),
      ),
    )
    expect(screen.getByText('Sent back by Ada Admin for changes')).toBeTruthy()
    expect(screen.getByText('Add a picture to exercise 2.')).toBeTruthy()
    expect((screen.getByLabelText('Title') as HTMLInputElement).disabled).toBe(false)
  })

  it.each(['in_review', 'published', 'archived'])('is read-only while the activity is %s', async (status) => {
    await open(serverFor(builderDetail({ status })))
    expect((screen.getByLabelText('Title') as HTMLInputElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Add exercise' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Check this activity' })).toBeNull()
    expect(screen.getAllByText(/can no longer be edited here/).length).toBeGreaterThan(0)
  })

  it('explains that an older-format activity needs an administrator', async () => {
    const made = makeClient(
      serverFor(builderDetail({ definition: { slug: 'count-to-ten', title: 'Count to ten', steps: [{ id: 's1', type: 'instruction', text: 'Hi' }] } })),
      educator(),
    )
    renderApp(made.client, '/activities/a1/build')
    expect(await screen.findByText(/older format that the guided builder cannot edit/)).toBeTruthy()
    expect(screen.getByText(/Ask an administrator/)).toBeTruthy()
  })

  it('tells an educator the activity is not theirs when the server answers 404', async () => {
    const made = makeClient({ ...serverFor(), 'GET /v1/admin/activities/a1': () => apiError(404, 'not_found') }, educator())
    renderApp(made.client, '/activities/a1/build')
    expect(await screen.findByText(/does not exist, or it is not yours/)).toBeTruthy()
  })
})
