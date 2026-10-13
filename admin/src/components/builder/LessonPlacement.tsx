import { useCallback, useState } from 'react'
import type { Board, BookDetail, BookSummary, LessonRef, Placement } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { useRequest } from '../../hooks/useRequest'
import { ErrorPanel } from '../ErrorPanel'

interface Props {
  activityId: string
  /** False once the activity is out of the author's hands (submitted, published). */
  canEdit: boolean
}

const toRefs = (list: Placement[]): LessonRef[] =>
  list.map((p) => ({ book: p.book_code, lesson: p.lesson_position, order: p.order }))

/**
 * The textbook lessons an activity belongs to. It saves each change straight away (it is not part of the activity's
 * exercises), and an activity may sit in lessons of several books, which is how it serves several boards.
 */
export function LessonPlacement({ activityId, canEdit }: Props) {
  const { api } = useAuth()
  const loadPlacements = useCallback((signal: AbortSignal) => api.activityLessons(activityId, signal), [api, activityId])
  const { data: loaded, error: loadError, reload } = useRequest(loadPlacements)
  const loadBoards = useCallback((signal: AbortSignal) => api.boards(signal), [api])
  const { data: boards } = useRequest(loadBoards)

  const [saved, setSaved] = useState<Placement[] | null>(null)
  const placements = saved ?? loaded
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const [board, setBoard] = useState('')
  const [bookCode, setBookCode] = useState('')
  const [lesson, setLesson] = useState('')
  const [order, setOrder] = useState('1')

  const loadBooks = useCallback(
    (signal: AbortSignal) => (board ? api.books({ board }, signal) : Promise.resolve([] as BookSummary[])),
    [api, board],
  )
  const { data: books } = useRequest(loadBooks)
  const loadBook = useCallback(
    (signal: AbortSignal) => (bookCode ? api.book(bookCode, signal) : Promise.resolve(null as BookDetail | null)),
    [api, bookCode],
  )
  const { data: book } = useRequest(loadBook)

  async function replace(next: LessonRef[]) {
    setBusy(true)
    setError(null)
    try {
      setSaved(await api.setActivityLessons(activityId, next))
      return true
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function add() {
    if (!placements || !bookCode || !lesson) return
    const pos = Number(lesson)
    const place = Math.max(0, Math.round(Number(order)) || 0)
    const others = toRefs(placements).filter((r) => !(r.book === bookCode && r.lesson === pos))
    if (await replace([...others, { book: bookCode, lesson: pos, order: place }])) {
      setLesson('')
    }
  }

  const boardName = (code: string) => boards?.find((b: Board) => b.code === code)?.name ?? code
  const bookReady = book && book.code === bookCode

  return (
    <section className="panel" aria-labelledby="lessons-heading">
      <h2 id="lessons-heading">Textbook lessons</h2>
      <p className="muted">
        Place this activity in the lesson it belongs to. Children see activities in textbook order. An activity can sit in
        several books, for example one for each board. Without a lesson it is shown to everyone.
      </p>

      {loadError && <ErrorPanel error={loadError} onRetry={reload} />}
      {!loadError && !placements && <p role="status">Loading lessons…</p>}

      {placements && placements.length === 0 && <p>Not placed in any textbook yet.</p>}
      {placements && placements.length > 0 && (
        <ul className="placements" aria-label="Lessons this activity is in">
          {placements.map((p) => (
            <li key={`${p.book_code}/${p.lesson_position}`}>
              <span>
                <strong>{boardName(p.board_code)}</strong> · Class {p.grade} · {p.book_title} · Lesson {p.lesson_position}:{' '}
                {p.lesson_title}
              </span>
              {canEdit && (
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={busy}
                  aria-label={`Remove from ${p.book_title}, lesson ${p.lesson_position}`}
                  onClick={() =>
                    void replace(toRefs(placements).filter((r) => !(r.book === p.book_code && r.lesson === p.lesson_position)))
                  }
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && placements && (
        <form
          className="placement-form"
          onSubmit={(e) => {
            e.preventDefault()
            void add()
          }}
        >
          <div className="field-row">
            <label className="field">
              <span className="field-label">Board</span>
              <select
                value={board}
                onChange={(e) => {
                  setBoard(e.target.value)
                  setBookCode('')
                  setLesson('')
                }}
              >
                <option value="">Choose a board</option>
                {(boards ?? []).map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Textbook</span>
              <select
                value={bookCode}
                disabled={!board}
                onChange={(e) => {
                  setBookCode(e.target.value)
                  setLesson('')
                }}
              >
                <option value="">{board && books && books.length === 0 ? 'No textbooks for this board yet' : 'Choose a textbook'}</option>
                {(books ?? []).map((b) => (
                  <option key={b.code} value={b.code}>
                    Class {b.grade} · {b.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Lesson</span>
              <select value={lesson} disabled={!bookReady} onChange={(e) => setLesson(e.target.value)}>
                <option value="">Choose a lesson</option>
                {(bookReady ? book.lessons : []).map((l) => (
                  <option key={l.position} value={l.position}>
                    {l.position}. {l.label ? `${l.label} · ` : ''}
                    {l.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Order in the lesson</span>
              <input type="number" min={0} max={100000} value={order} onChange={(e) => setOrder(e.target.value)} />
            </label>
          </div>
          <button type="submit" className="btn" disabled={busy || !lesson}>
            Add to this lesson
          </button>
        </form>
      )}
      {!canEdit && <p className="muted">This activity can no longer be changed by its author.</p>}
      {error && <ErrorPanel error={error} />}
    </section>
  )
}
