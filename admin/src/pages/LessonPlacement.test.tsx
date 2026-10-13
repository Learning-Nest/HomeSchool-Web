import { fireEvent, screen, waitFor } from '@testing-library/react'
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
  type Call,
  type Handler,
} from '../test/fakeApi'
import { renderApp } from '../test/renderApp'

const book = {
  code: 'cbse-1-english-marigold',
  board_code: 'CBSE',
  grade: '1',
  subject_code: 'ENG',
  title: 'Marigold 1',
  publisher: 'NCERT',
  edition_year: 2024,
  level_code: 'L2',
  lesson_count: 2,
}
const placement = (over: Record<string, unknown> = {}) => ({
  board_code: 'CBSE',
  book_code: book.code,
  book_title: book.title,
  grade: '1',
  lesson_position: 1,
  lesson_title: 'A Happy Child',
  order: 2,
  ...over,
})

function server(initial: unknown[], detail = builderDetail(), extra: Record<string, Handler> = {}) {
  return {
    'GET /v1/admin/activities/a1': () => json(200, detail),
    'GET /v1/curriculum/subjects': () => json(200, subjectsFixture),
    'GET /v1/curriculum/levels': () => json(200, levelsFixture),
    'GET /v1/curriculum/skills': () => json(200, skillsFixture),
    'GET /v1/admin/activities/a1/assets': () => json(200, [assetFixture()]),
    'GET /v1/admin/activities/a1/lessons': () => json(200, initial),
    'GET /v1/curriculum/boards': () =>
      json(200, [
        { code: 'CBSE', name: 'CBSE' },
        { code: 'ICSE', name: 'ICSE' },
      ]),
    'GET /v1/curriculum/books': (c: Call) => json(200, c.query.get('board') === 'CBSE' ? [book] : []),
    [`GET /v1/curriculum/books/${book.code}`]: () =>
      json(200, {
        ...book,
        lessons: [
          { position: 1, label: 'Unit 1', title: 'A Happy Child', activity_count: 1 },
          { position: 2, label: null, title: 'Three Little Pigs', activity_count: 0 },
        ],
      }),
    ...extra,
  }
}

async function open(handlers: Record<string, Handler>) {
  const made = makeClient(handlers, { session: storedSession(1, Date.now() + 900_000, 'educator') })
  const view = renderApp(made.client, '/activities/a1/build')
  await screen.findByRole('heading', { name: 'Textbook lessons' })
  return { ...made, ...view }
}

describe('Textbook lessons panel', () => {
  it('says so when the activity is not in any textbook', async () => {
    await open(server([]))
    expect(await screen.findByText('Not placed in any textbook yet.')).toBeTruthy()
  })

  it('lists where the activity is placed', async () => {
    await open(server([placement()]))
    const list = await screen.findByRole('list', { name: 'Lessons this activity is in' })
    expect(list.textContent).toMatch(/CBSE · Class 1 · Marigold 1 · Lesson 1: A Happy Child/)
  })

  it('adds a lesson by board, textbook and lesson, sending the existing links along', async () => {
    let put: unknown = null
    const { calls } = await open(
      server([placement({ lesson_position: 2, lesson_title: 'Three Little Pigs', order: 3 })], builderDetail(), {
        'PUT /v1/admin/activities/a1/lessons': (c: Call) => {
          put = c.body
          return json(200, [placement(), placement({ lesson_position: 2, lesson_title: 'Three Little Pigs', order: 3 })])
        },
      }),
    )
    await screen.findByRole('list', { name: 'Lessons this activity is in' })
    expect((screen.getByLabelText('Textbook') as HTMLSelectElement).disabled).toBe(true)
    await waitFor(() => expect(screen.getByRole('option', { name: 'CBSE' })).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Board'), { target: { value: 'CBSE' } })
    await waitFor(() => expect(screen.getByRole('option', { name: /Class 1 · Marigold 1/ })).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Textbook'), { target: { value: book.code } })
    await waitFor(() => expect(screen.getByRole('option', { name: /1\. Unit 1 · A Happy Child/ })).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Lesson'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Order in the lesson'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add to this lesson' }))
    await waitFor(() =>
      expect(put).toEqual({
        lessons: [
          { book: book.code, lesson: 2, order: 3 },
          { book: book.code, lesson: 1, order: 2 },
        ],
      }),
    )
    await waitFor(() => expect(screen.getAllByRole('listitem').filter((li) => /Lesson \d:/.test(li.textContent ?? ''))).toHaveLength(2))
    expect(calls.some((c) => c.method === 'PUT')).toBe(true)
  })

  it('removes a lesson', async () => {
    let put: unknown = null
    await open(
      server([placement()], builderDetail(), {
        'PUT /v1/admin/activities/a1/lessons': (c: Call) => {
          put = c.body
          return json(200, [])
        },
      }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /Remove from Marigold 1, lesson 1/ }))
    await waitFor(() => expect(put).toEqual({ lessons: [] }))
    expect(await screen.findByText('Not placed in any textbook yet.')).toBeTruthy()
  })

  it('is read-only once the activity has been sent for review', async () => {
    await open(server([placement()], builderDetail({ status: 'in_review' })))
    await screen.findByRole('list', { name: 'Lessons this activity is in' })
    expect(screen.queryByRole('button', { name: /Remove from/ })).toBeNull()
    expect(screen.queryByLabelText('Board')).toBeNull()
    expect(screen.getByText(/can no longer be changed/)).toBeTruthy()
  })
})
