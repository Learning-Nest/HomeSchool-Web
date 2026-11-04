import { useCallback, useState, type FormEvent } from 'react'
import type { ReleasePreview } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { ErrorPanel } from '../components/ErrorPanel'
import { Loading } from '../components/Loading'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useRequest } from '../hooks/useRequest'

export function CoveragePage() {
  useDocumentTitle('Coverage')
  const { api } = useAuth()
  const [board, setBoard] = useState('')
  const [grade, setGrade] = useState('')
  const [target, setTarget] = useState(3)
  const loadBoards = useCallback((signal: AbortSignal) => api.boards(signal), [api])
  const load = useCallback(
    (signal: AbortSignal) =>
      api.coverage({ board: board || undefined, grade: grade.trim() || undefined, target_per_lesson: target }, signal),
    [api, board, grade, target],
  )
  const { data: boards } = useRequest(loadBoards)
  const { data, error, reload } = useRequest(load)

  const [days, setDays] = useState(5)
  const [preview, setPreview] = useState<ReleasePreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<Error | null>(null)

  async function runPreview(event: FormEvent) {
    event.preventDefault()
    setPreviewing(true)
    setPreviewError(null)
    try {
      setPreview(await api.releasePreview({ board_code: board, grade: grade.trim(), days }))
    } catch (e) {
      setPreview(null)
      setPreviewError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setPreviewing(false)
    }
  }

  return (
    <>
      <h1>Coverage</h1>
      <p className="muted">
        How many published activities each textbook has, lesson by lesson. A book with no activities in a lesson skips that lesson
        when activities are released, and “days of content” says how long a child lasts at the current pace.
      </p>

      <div className="field-row">
        <label className="field">
          <span className="field-label">Board</span>
          <select value={board} onChange={(e) => setBoard(e.target.value)}>
            <option value="">All boards</option>
            {(boards ?? []).map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Grade</span>
          <input type="text" maxLength={20} value={grade} onChange={(e) => setGrade(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Activities wanted in each lesson</span>
          <input type="number" min={1} max={20} value={target} onChange={(e) => setTarget(Math.min(20, Math.max(1, Number(e.target.value) || 1)))} />
        </label>
      </div>

      {error && <ErrorPanel error={error} onRetry={reload} />}
      {!error && !data && <Loading label="Loading coverage…" />}
      {!error && data && data.books.length === 0 && <p className="panel">No textbooks match.</p>}
      {!error && data && data.books.length > 0 && (
        <div className="table-wrap" role="region" aria-label="Coverage table" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th scope="col">Book</th>
                <th scope="col">Grade</th>
                <th scope="col" className="num">
                  Lessons
                </th>
                <th scope="col" className="num">
                  With activities
                </th>
                <th scope="col" className="num">
                  Under {data.target_per_lesson}
                </th>
                <th scope="col" className="num">
                  Activities
                </th>
                <th scope="col" className="num">
                  Minutes
                </th>
                <th scope="col" className="num">
                  Days of content
                </th>
              </tr>
            </thead>
            <tbody>
              {data.books.map((b) => (
                <tr key={b.code}>
                  <th scope="row">
                    {b.title}
                    <span className="slug">{b.code}</span>
                    {b.weak_lessons.length > 0 && (
                      <details>
                        <summary>Lessons under the target</summary>
                        <ul>
                          {b.weak_lessons.map((l) => (
                            <li key={l.position}>
                              {l.position}. {l.title}: {l.published_activities}
                            </li>
                          ))}
                          {b.lessons_below_target > b.weak_lessons.length && (
                            <li>and {b.lessons_below_target - b.weak_lessons.length} more</li>
                          )}
                        </ul>
                      </details>
                    )}
                  </th>
                  <td>
                    {b.board_code} {b.grade}
                  </td>
                  <td className="num">{b.lessons}</td>
                  <td className="num">{b.lessons_with_activities}</td>
                  <td className="num">{b.lessons_below_target}</td>
                  <td className="num">{b.published_activities}</td>
                  <td className="num">{b.minutes}</td>
                  <td className="num">{b.days_of_content}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="panel" aria-labelledby="preview-heading">
        <h2 id="preview-heading">Preview the first days</h2>
        <p className="muted">
          What a new child of the board and grade above would get, assuming every set is finished. Choose a board and a grade first.
        </p>
        <form className="field-row" onSubmit={runPreview}>
          <label className="field">
            <span className="field-label">Days</span>
            <input type="number" min={1} max={30} value={days} onChange={(e) => setDays(Math.min(30, Math.max(1, Number(e.target.value) || 1)))} />
          </label>
          <div className="field field-action">
            <button type="submit" className="btn btn-primary" disabled={previewing || !board || !grade.trim()}>
              {previewing ? 'Working…' : 'Show preview'}
            </button>
          </div>
        </form>
        {previewError && <ErrorPanel error={previewError} />}
        {preview && preview.days.length === 0 && <p>Nothing would be released: these books have no published activities in lessons.</p>}
        {preview && preview.days.length > 0 && (
          <>
            {preview.days.map((d) => (
              <div key={d.day}>
                <h3>
                  Day {d.day} <span className="muted">({d.minutes} min)</span>
                </h3>
                <ol>
                  {d.activities.map((a) => (
                    <li key={a.slug}>
                      {a.title} <span className="slug">{a.book_code}, lesson {a.lesson_position}, order {a.order}, {a.duration_min} min</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
            <p className="muted">{preview.remaining_activities} more activities remain after these days.</p>
          </>
        )}
      </section>
    </>
  )
}
