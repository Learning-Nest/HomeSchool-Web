import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { activityDetail, apiError, json, makeClient } from '../test/fakeApi'
import { renderApp } from '../test/renderApp'

const detailHandler = (status = 'draft') => () => json(200, activityDetail({ status }))

function editor() {
  return screen.getByLabelText('Definition JSON') as HTMLTextAreaElement
}

describe('activity editor', () => {
  it('shows the definition with its answer key and a preview of the steps', async () => {
    const { client } = makeClient({ 'GET /v1/admin/activities/a1': detailHandler() })
    renderApp(client, '/activities/a1')

    await screen.findByRole('heading', { name: 'Count to ten', level: 1 })
    expect(editor().value).toContain('"correct": [')
    const preview = screen.getByRole('region', { name: 'How a child sees it' })
    expect(within(preview).getByText('Count the apples.')).toBeTruthy()
    expect(within(preview).getByText('How many apples?')).toBeTruthy()
    expect(within(preview).getByText('Ten')).toBeTruthy()
    expect(within(preview).getByText(/Not shown to the child/)).toBeTruthy()
    expect(within(preview).queryByText('Answer key:')).toBeNull()

    fireEvent.click(within(preview).getByLabelText('Show answer keys'))
    expect(within(preview).getByText('Answer key:')).toBeTruthy()
  })

  it('blocks saving while the JSON is invalid and points at the error', async () => {
    const { client } = makeClient({ 'GET /v1/admin/activities/a1': detailHandler() })
    renderApp(client, '/activities/a1')
    await screen.findByLabelText('Definition JSON')

    fireEvent.change(editor(), { target: { value: '{\n  "slug": "count-to-ten",\n}' } })

    expect(await screen.findByText(/JSON error at line 3, column 1/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Save definition' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Format' }) as HTMLButtonElement).disabled).toBe(true)
    // The preview keeps the last readable definition rather than going blank mid-edit.
    expect(screen.getByText('Count the apples.')).toBeTruthy()
  })

  it('formats valid JSON', async () => {
    const { client } = makeClient({ 'GET /v1/admin/activities/a1': detailHandler() })
    renderApp(client, '/activities/a1')
    await screen.findByLabelText('Definition JSON')

    fireEvent.change(editor(), { target: { value: '{"slug":"count-to-ten","steps":[]}' } })
    fireEvent.click(screen.getByRole('button', { name: 'Format' }))

    expect(editor().value).toBe('{\n  "slug": "count-to-ten",\n  "steps": []\n}')
  })

  it('saves with PUT /definition and shows the new version', async () => {
    let put: unknown
    const { client } = makeClient({
      'GET /v1/admin/activities/a1': detailHandler('published'),
      'PUT /v1/admin/activities/a1/definition': ({ body }) => {
        put = body
        const definition = (body as { definition: Record<string, unknown> }).definition
        return json(200, activityDetail({ status: 'published', version: 2, definition }))
      },
    })
    renderApp(client, '/activities/a1')
    await screen.findByLabelText('Definition JSON')

    fireEvent.change(editor(), { target: { value: editor().value.replace('Count the apples.', 'Count the pears.') } })
    fireEvent.click(screen.getByRole('button', { name: 'Save definition' }))

    expect(await screen.findByText('Saved. This is version 2.')).toBeTruthy()
    expect(JSON.stringify(put)).toContain('Count the pears.')
    expect((screen.getByRole('button', { name: 'Save definition' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('lists the server validation problems and keeps the edit', async () => {
    const { client } = makeClient({
      'GET /v1/admin/activities/a1': detailHandler(),
      'PUT /v1/admin/activities/a1/definition': () =>
        apiError(422, 'content_invalid', { problems: ['s2: scored single_choice needs correct', 'unknown skill MAT.X.Y'] }),
    })
    renderApp(client, '/activities/a1')
    await screen.findByLabelText('Definition JSON')

    fireEvent.change(editor(), { target: { value: editor().value.replace('"title": "Count to ten"', '"title": "Changed"') } })
    fireEvent.click(screen.getByRole('button', { name: 'Save definition' }))

    const alert = await screen.findByRole('alert')
    const items = within(alert).getAllByRole('listitem').map((li) => li.textContent)
    expect(items).toEqual(['s2: scored single_choice needs correct', 'unknown skill MAT.X.Y'])
    expect(alert.textContent).toContain('req-123')
    expect(editor().value).toContain('"Changed"')
  })

  it.each([
    ['draft', ['Send to review', 'Archive']],
    ['in_review', ['Back to draft', 'Publish', 'Archive']],
    ['published', ['Archive']],
    ['archived', ['Restore as draft']],
  ])('offers only the legal transitions from %s', async (status, labels) => {
    const { client } = makeClient({ 'GET /v1/admin/activities/a1': detailHandler(status) })
    renderApp(client, '/activities/a1')
    const panel = (await screen.findByRole('heading', { name: /^Status:/ })).closest('section')!

    expect(within(panel).getAllByRole('button').map((b) => b.textContent)).toEqual(labels)
  })

  it('asks for confirmation before publishing and posts the new status only after it', async () => {
    let posted: unknown = null
    const { client } = makeClient({
      'GET /v1/admin/activities/a1': detailHandler('in_review'),
      'POST /v1/admin/activities/a1/status': ({ body }) => {
        posted = body
        return json(200, activityDetail({ status: 'published' }))
      },
    })
    renderApp(client, '/activities/a1')
    fireEvent.click(await screen.findByRole('button', { name: 'Publish' }))

    const dialog = await screen.findByRole('dialog', { name: 'Publish this activity?' })
    expect(posted).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }))

    expect(await screen.findByText('Status is now Published.')).toBeTruthy()
    expect(posted).toEqual({ status: 'published' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('does not post anything when the confirmation is cancelled', async () => {
    const { client, calls } = makeClient({ 'GET /v1/admin/activities/a1': detailHandler('published') })
    renderApp(client, '/activities/a1')
    fireEvent.click(await screen.findByRole('button', { name: 'Archive' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('moves to review without a confirmation step', async () => {
    const { client } = makeClient({
      'GET /v1/admin/activities/a1': detailHandler(),
      'POST /v1/admin/activities/a1/status': () => json(200, activityDetail({ status: 'in_review' })),
    })
    renderApp(client, '/activities/a1')
    fireEvent.click(await screen.findByRole('button', { name: 'Send to review' }))

    expect(await screen.findByText('Status is now In review.')).toBeTruthy()
  })

  it('shows publish problems from the server', async () => {
    const { client } = makeClient({
      'GET /v1/admin/activities/a1': detailHandler('in_review'),
      'POST /v1/admin/activities/a1/status': () => apiError(422, 'content_invalid', { problems: ['unknown skill MAT.X.Y'] }),
    })
    renderApp(client, '/activities/a1')
    fireEvent.click(await screen.findByRole('button', { name: 'Publish' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Publish' }))

    expect((await screen.findByRole('alert')).textContent).toContain('unknown skill MAT.X.Y')
  })

  it('disables status changes while there are unsaved edits', async () => {
    const { client } = makeClient({ 'GET /v1/admin/activities/a1': detailHandler('in_review') })
    renderApp(client, '/activities/a1')
    await screen.findByLabelText('Definition JSON')
    fireEvent.change(editor(), { target: { value: editor().value + ' ' } })

    expect((screen.getByRole('button', { name: 'Publish' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/Save or revert your edits/)).toBeTruthy()
  })

  it('warns before leaving with unsaved edits', async () => {
    const { client } = makeClient({
      'GET /v1/admin/activities/a1': detailHandler(),
      'GET /v1/admin/activities': () => json(200, []),
      'GET /v1/curriculum/subjects': () => json(200, []),
    })
    const { router } = renderApp(client, '/activities/a1')
    await screen.findByLabelText('Definition JSON')
    fireEvent.change(editor(), { target: { value: editor().value + ' ' } })

    fireEvent.click(screen.getByRole('link', { name: '← All activities' }))
    const dialog = await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })
    expect(router.state.location.pathname).toBe('/activities/a1')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    expect(router.state.location.pathname).toBe('/activities/a1')

    fireEvent.click(screen.getByRole('link', { name: '← All activities' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Discard and leave' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/activities'))
  })

  it('explains a missing activity', async () => {
    const { client } = makeClient({ 'GET /v1/admin/activities/a1': () => apiError(404, 'not_found') })
    renderApp(client, '/activities/a1')

    expect((await screen.findByRole('alert')).textContent).toContain('This activity does not exist.')
  })
})
