import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { apiError, json, makeClient, storedSession } from '../test/fakeApi'
import { renderApp } from '../test/renderApp'

const as = (role: string) => ({ session: storedSession(1, Date.now() + 900_000, role) })

const policy = (overrides: Record<string, unknown> = {}) => ({
  scope_board: '',
  scope_grade: '',
  release_threshold: 0.7,
  set_minutes: 45,
  set_max_activities: 5,
  max_open_items: 10,
  school_days: [1, 2, 3, 4, 5, 6, 7],
  strong_score: 0.85,
  revision_open_cap: 5,
  revision_cooldown_days: 1,
  child_daily_practice_limit: 3,
  updated_at: '2026-11-04T05:00:00Z',
  ...overrides,
})
const boards = () => json(200, [{ code: 'CBSE', name: 'CBSE' }])

describe('ReleaseSettingsPage', () => {
  it('shows the settings to a content admin without any way to change them', async () => {
    const { client } = makeClient(
      {
        'GET /v1/admin/release-policies': () => json(200, [policy(), policy({ scope_board: 'CBSE', scope_grade: '3', release_threshold: 0.8, school_days: [1, 2, 3, 4, 5] })]),
        'GET /v1/curriculum/boards': boards,
      },
      as('content_admin'),
    )
    renderApp(client, '/release')
    expect(await screen.findByText('Everyone (default)')).toBeTruthy()
    expect(screen.getByText('CBSE, grade 3')).toBeTruthy()
    expect(screen.getByText('80%')).toBeTruthy()
    expect(screen.getByText('Mon, Tue, Wed, Thu, Fri')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Edit/ })).toBeNull()
    expect(screen.getByText(/Only a super admin can change/)).toBeTruthy()
  })

  it('lets a super admin change the default and sends whole percentages as fractions', async () => {
    let saved: unknown
    let query = ''
    const { client } = makeClient(
      {
        'GET /v1/admin/release-policies': () => json(200, [policy()]),
        'GET /v1/curriculum/boards': boards,
        'PUT /v1/admin/release-policies': (call) => {
          saved = call.body
          query = call.query.toString()
          return json(200, policy({ release_threshold: 0.6 }))
        },
      },
      as('super_admin'),
    )
    renderApp(client, '/release')
    fireEvent.click(await screen.findByRole('button', { name: /Edit\s*Everyone/ }))
    fireEvent.change(await screen.findByLabelText(/Release a new set when/), { target: { value: '60' } })
    fireEvent.click(screen.getByLabelText('Sun'))
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    expect((await screen.findByRole('status')).textContent).toContain('Saved the settings for Everyone (default)')
    expect(new URLSearchParams(query).get('board') ?? '').toBe('') // empty = the default row
    expect(saved).toMatchObject({ release_threshold: 0.6, strong_score: 0.85, school_days: [1, 2, 3, 4, 5, 6] })
  })

  it('adds an override for a board and grade and can remove it after asking', async () => {
    let created: URLSearchParams | undefined
    let removed = false
    const { client } = makeClient(
      {
        'GET /v1/admin/release-policies': () => json(200, removed ? [policy()] : [policy(), policy({ scope_board: 'CBSE', scope_grade: '3' })]),
        'GET /v1/curriculum/boards': boards,
        'PUT /v1/admin/release-policies': (call) => {
          created = call.query
          return json(200, policy({ scope_board: 'CBSE', scope_grade: '3' }))
        },
        'DELETE /v1/admin/release-policies': () => {
          removed = true
          return json(204, null)
        },
      },
      as('super_admin'),
    )
    renderApp(client, '/release')
    fireEvent.click(await screen.findByRole('button', { name: 'Add settings for a board or grade' }))
    fireEvent.change(await screen.findByLabelText(/Grade/), { target: { value: ' 3 ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() => expect(created?.get('board')).toBe('CBSE'))
    expect(created?.get('grade')).toBe('3')

    fireEvent.click(await screen.findByRole('button', { name: /Remove\s*CBSE, grade 3/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(removed).toBe(true))
    expect((await screen.findByRole('status')).textContent).toContain('Removed the override')
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull() // the default row cannot be removed
  })

  it('explains a refused save and will not save without a school day', async () => {
    const { client } = makeClient(
      {
        'GET /v1/admin/release-policies': () => json(200, [policy({ school_days: [1] })]),
        'GET /v1/curriculum/boards': boards,
        'PUT /v1/admin/release-policies': () => apiError(422, 'validation_error'),
      },
      as('super_admin'),
    )
    renderApp(client, '/release')
    fireEvent.click(await screen.findByRole('button', { name: /Edit\s*Everyone/ }))
    fireEvent.click(await screen.findByLabelText('Mon'))
    expect(screen.getByText('Choose at least one day.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Save settings' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('Tue'))
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
  })

  it('is closed to educators', async () => {
    const { client } = makeClient({ 'GET /v1/admin/activities': () => json(200, []) }, as('educator'))
    const { router } = renderApp(client, '/release')
    await waitFor(() => expect(router.state.location.pathname).toBe('/activities'))
  })
})

describe('CoveragePage', () => {
  const book = (o: Record<string, unknown> = {}) => ({
    code: 'cbse-3-mat',
    board_code: 'CBSE',
    grade: '3',
    subject_code: 'MAT',
    title: 'Maths Mela 3',
    lessons: 3,
    lessons_with_activities: 2,
    lessons_below_target: 2,
    published_activities: 4,
    minutes: 52,
    days_of_content: 2,
    weak_lessons: [
      { position: 2, title: 'Shapes', published_activities: 1, minutes: 12 },
      { position: 3, title: 'Numbers', published_activities: 0, minutes: 0 },
    ],
    ...o,
  })

  it('lists books with their runway and the lessons that are short of activities', async () => {
    let query = ''
    const { client } = makeClient(
      {
        'GET /v1/curriculum/boards': boards,
        'GET /v1/admin/coverage': (call) => {
          query = call.query.toString()
          return json(200, { target_per_lesson: Number(call.query.get('target_per_lesson')), books: [book()] })
        },
      },
      as('content_admin'),
    )
    renderApp(client, '/coverage')
    expect(await screen.findByText('Maths Mela 3')).toBeTruthy()
    expect(query).toContain('target_per_lesson=3')
    expect(screen.getByRole('columnheader', { name: 'Under 3' })).toBeTruthy()
    expect(screen.getByText(/2\. Shapes: 1/)).toBeTruthy()
    expect(screen.getByText(/3\. Numbers: 0/)).toBeTruthy()
  })

  it('previews the first days for a board and grade', async () => {
    let body: unknown
    const { client } = makeClient(
      {
        'GET /v1/curriculum/boards': boards,
        'GET /v1/admin/coverage': () => json(200, { target_per_lesson: 3, books: [book()] }),
        'POST /v1/admin/release-preview': (call) => {
          body = call.body
          return json(200, {
            board_code: 'CBSE',
            grade: '3',
            books: ['cbse-3-mat'],
            remaining_activities: 2,
            days: [
              {
                day: 1,
                minutes: 27,
                activities: [{ slug: 'count-the-dogs', title: 'Count the dogs', book_code: 'cbse-3-mat', lesson_position: 1, order: 10, duration_min: 12 }],
              },
            ],
          })
        },
      },
      as('content_admin'),
    )
    renderApp(client, '/coverage')
    await screen.findByText('Maths Mela 3')
    const button = screen.getByRole('button', { name: 'Show preview' }) as HTMLButtonElement
    expect(button.disabled).toBe(true) // needs a board and a grade
    fireEvent.change(screen.getByLabelText('Board'), { target: { value: 'CBSE' } })
    fireEvent.change(screen.getByLabelText('Grade'), { target: { value: '3' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Show preview' }))
    expect(await screen.findByText('Count the dogs')).toBeTruthy()
    expect(body).toEqual({ board_code: 'CBSE', grade: '3', days: 5 })
    expect(screen.getByText(/2 more activities remain/)).toBeTruthy()
  })
})
