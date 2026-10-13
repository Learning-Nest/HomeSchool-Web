import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { apiError, builderDetail, type Call, json, levelsFixture, makeClient, storedSession, subjectsFixture } from '../test/fakeApi'
import { renderApp } from '../test/renderApp'

const handlers = (extra = {}) => ({
  'GET /v1/curriculum/subjects': () => json(200, subjectsFixture),
  'GET /v1/curriculum/levels': () => json(200, levelsFixture),
  'GET /v1/curriculum/boards': () => json(200, [{ code: 'CBSE', name: 'CBSE' }]),
  'GET /v1/curriculum/books': () =>
    json(200, [{ code: 'cbse-1-eng', board_code: 'CBSE', grade: '1', subject_code: 'LIT', title: 'Marigold 1', publisher: null, edition_year: null, level_code: null, lesson_count: 1 }]),
  'GET /v1/curriculum/books/cbse-1-eng': () =>
    json(200, { code: 'cbse-1-eng', board_code: 'CBSE', grade: '1', subject_code: 'LIT', title: 'Marigold 1', publisher: null, edition_year: null, level_code: null, lesson_count: 1, lessons: [{ position: 1, label: null, title: 'A Happy Child', activity_count: 0 }] }),
  ...extra,
})
const educator = () => ({ session: storedSession(1, Date.now() + 900_000, 'educator') })

describe('NewActivityPage', () => {
  it('starts a draft with the chosen number of exercises and opens the builder', async () => {
    const { client, calls } = makeClient(
      handlers({ 'POST /v1/admin/activities': () => json(201, builderDetail({ id: 'new1' })) }),
      educator(),
    )
    const { router } = renderApp(client, '/activities/new')
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: '  Shapes  ' } })
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'LIT' } })
    fireEvent.change(screen.getByLabelText('To level'), { target: { value: 'L3' } })
    fireEvent.change(screen.getByLabelText('Number of exercises'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Start every exercise as'), { target: { value: 'numeric_input' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create and start building' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/activities/new1/build'))
    const post = calls.find((c) => c.method === 'POST')
    const def = (post?.body as { definition: { title: string; subject: string; level_from: string; level_to: string; steps: { type: string }[] } }).definition
    expect(def).toMatchObject({ title: 'Shapes', subject: 'LIT', level_from: 'L1', level_to: 'L3' })
    expect(def.steps).toHaveLength(4)
    expect(def.steps.every((s) => s.type === 'numeric_input')).toBe(true)
  })

  it('offers the board, textbook and lesson, and saves the chosen lessons with the new activity', async () => {
    let put: unknown = null
    const { client, calls } = makeClient(
      handlers({
        'POST /v1/admin/activities': () => json(201, builderDetail({ id: 'new1' })),
        'PUT /v1/admin/activities/new1/lessons': (c: Call) => {
          put = c.body
          return json(200, [])
        },
      }),
      educator(),
    )
    const { router } = renderApp(client, '/activities/new')
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Shapes' } })
    const board = (await screen.findByLabelText('Board')) as HTMLSelectElement
    await waitFor(() => expect(screen.getByRole('option', { name: 'CBSE' })).toBeTruthy())
    fireEvent.change(board, { target: { value: 'CBSE' } })
    await waitFor(() => expect(screen.getByRole('option', { name: /Class 1 · Marigold 1/ })).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Textbook'), { target: { value: 'cbse-1-eng' } })
    await waitFor(() => expect(screen.getByRole('option', { name: /1\. A Happy Child/ })).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Lesson'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add to this lesson' }))
    expect(screen.getByRole('list', { name: 'Chosen lessons' }).textContent).toMatch(/Marigold 1 · Lesson 1: A Happy Child/)

    fireEvent.click(screen.getByRole('button', { name: 'Create and start building' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/activities/new1/build'))
    expect(put).toEqual({ lessons: [{ book: 'cbse-1-eng', lesson: 1, order: 1 }] })
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1)
  })

  it('does not send anything until the basics make sense', async () => {
    const { client, calls } = makeClient(handlers(), educator())
    renderApp(client, '/activities/new')
    const start = (await screen.findByRole('button', { name: 'Create and start building' })) as HTMLButtonElement
    expect(start.disabled).toBe(true)
    // no scolding before the person has typed anything
    expect(screen.queryByRole('list', { name: 'Problems' })).toBeNull()

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Shapes' } })
    fireEvent.change(screen.getByLabelText('From level'), { target: { value: 'L3' } })
    fireEvent.change(screen.getByLabelText('To level'), { target: { value: 'L1' } })
    expect(screen.getByText('The last level cannot be lower than the first.')).toBeTruthy()
    expect(start.disabled).toBe(true)
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('shows the server error and stays on the page', async () => {
    const { client } = makeClient(handlers({ 'POST /v1/admin/activities': () => apiError(422, 'validation_error') }), educator())
    const { router } = renderApp(client, '/activities/new')
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Shapes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create and start building' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/activities/new')
  })
})
