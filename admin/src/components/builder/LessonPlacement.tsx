import { useCallback, useState } from 'react'
import type { Board, LessonRef, Placement } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { useRequest } from '../../hooks/useRequest'
import { ErrorPanel } from '../ErrorPanel'
import { LessonPicker } from './LessonPicker'

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

  async function add(p: Placement) {
    if (!placements) return
    const others = toRefs(placements).filter((r) => !(r.book === p.book_code && r.lesson === p.lesson_position))
    await replace([...others, { book: p.book_code, lesson: p.lesson_position, order: p.order }])
  }

  const boardName = (code: string) => boards?.find((b: Board) => b.code === code)?.name ?? code

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

      {canEdit && placements && <LessonPicker disabled={busy} onAdd={(p) => add(p)} />}
      {!canEdit && <p className="muted">This activity can no longer be changed by its author.</p>}
      {error && <ErrorPanel error={error} />}
    </section>
  )
}
