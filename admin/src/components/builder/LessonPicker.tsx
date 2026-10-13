import { useCallback, useState } from 'react'
import type { BookDetail, BookSummary, Placement } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { useRequest } from '../../hooks/useRequest'

interface Props {
  /** Called with the chosen lesson, shaped like a saved placement so lists can show it the same way. */
  onAdd(placement: Placement): void | Promise<void>
  disabled?: boolean
}

/** Board, then textbook, then lesson (and the activity's order inside it). Boards and books come from the server. */
export function LessonPicker({ onAdd, disabled = false }: Props) {
  const { api } = useAuth()
  const loadBoards = useCallback((signal: AbortSignal) => api.boards(signal), [api])
  const { data: boards, error: boardsError } = useRequest(loadBoards)

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
  const bookReady = book && book.code === bookCode ? book : null

  async function add() {
    if (!bookReady || !lesson) return
    const chosen = bookReady.lessons.find((l) => String(l.position) === lesson)
    if (!chosen) return
    await onAdd({
      board_code: bookReady.board_code,
      book_code: bookReady.code,
      book_title: bookReady.title,
      grade: bookReady.grade,
      lesson_position: chosen.position,
      lesson_title: chosen.title,
      order: Math.max(0, Math.round(Number(order)) || 0),
    })
    setLesson('')
  }

  return (
    <div className="placement-form">
      <div className="field-row">
        <label className="field">
          <span className="field-label">Board</span>
          <select
            value={board}
            disabled={disabled}
            onChange={(e) => {
              setBoard(e.target.value)
              setBookCode('')
              setLesson('')
            }}
          >
            <option value="">{boardsError ? 'Boards could not be loaded' : boards && boards.length === 0 ? 'No boards yet' : 'Choose a board'}</option>
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
            disabled={disabled || !board}
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
          <select value={lesson} disabled={disabled || !bookReady} onChange={(e) => setLesson(e.target.value)}>
            <option value="">Choose a lesson</option>
            {(bookReady ? bookReady.lessons : []).map((l) => (
              <option key={l.position} value={l.position}>
                {l.position}. {l.label ? `${l.label} · ` : ''}
                {l.title}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Order in the lesson</span>
          <input type="number" min={0} max={100000} value={order} disabled={disabled} onChange={(e) => setOrder(e.target.value)} />
        </label>
      </div>
      <button type="button" className="btn" disabled={disabled || !lesson} onClick={() => void add()}>
        Add to this lesson
      </button>
    </div>
  )
}
