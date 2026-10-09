import { useCallback, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ErrorPanel } from '../components/ErrorPanel'
import { Loading } from '../components/Loading'
import { MAX_STEPS, newDefinition, STEP_TYPES } from '../domain/builder'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useRequest } from '../hooks/useRequest'

/** The first screen of a new activity: the basics and how many exercises to start with. The builder does the rest. */
export function NewActivityPage() {
  useDocumentTitle('New activity')
  const { api } = useAuth()
  const navigate = useNavigate()
  const loadSubjects = useCallback((signal: AbortSignal) => api.subjects(signal), [api])
  const { data: subjects, error: subjectsError, reload: reloadSubjects } = useRequest(loadSubjects)
  const loadLevels = useCallback((signal: AbortSignal) => api.levels(signal), [api])
  const { data: levels, error: levelsError, reload: reloadLevels } = useRequest(loadLevels)

  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [levelFrom, setLevelFrom] = useState('')
  const [levelTo, setLevelTo] = useState('')
  const [minutes, setMinutes] = useState('15')
  const [exercises, setExercises] = useState('5')
  const [firstType, setFirstType] = useState('single_choice')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const loadError = subjectsError ?? levelsError
  if (loadError) {
    return <ErrorPanel error={loadError} onRetry={() => (subjectsError ? reloadSubjects() : reloadLevels())} />
  }
  if (!subjects || !levels) return <Loading label="Loading…" />

  const order = levels.map((l) => l.code)
  const from = levelFrom || order[0] || ''
  const to = levelTo || from
  const subj = subject || subjects[0]?.code || ''
  const minutesN = Math.round(Number(minutes))
  const exercisesN = Math.round(Number(exercises))

  const problems: string[] = []
  if (title.trim() === '') problems.push('Give the activity a title.')
  if (order.indexOf(to) < order.indexOf(from)) problems.push('The last level cannot be lower than the first.')
  if (!Number.isFinite(minutesN) || minutesN < 1 || minutesN > 180) problems.push('Minutes must be between 1 and 180.')
  if (!Number.isFinite(exercisesN) || exercisesN < 1 || exercisesN > MAX_STEPS) problems.push(`Choose between 1 and ${MAX_STEPS} exercises.`)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (problems.length > 0) return
    setBusy(true)
    setError(null)
    try {
      const created = await api.createActivity(
        newDefinition({
          title,
          subject: subj,
          levelFrom: from,
          levelTo: to,
          durationMin: minutesN,
          exerciseCount: exercisesN,
          firstType,
        }) as unknown as Record<string, unknown>,
      )
      await navigate(`/activities/${created.id}/build`, { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
      setBusy(false)
    }
  }

  return (
    <>
      <p className="breadcrumb">
        <Link to="/activities">← All activities</Link>
      </p>
      <h1>New activity</h1>
      <form className="panel form-narrow" onSubmit={submit} aria-label="New activity">
        <p className="muted">Start with the basics. You fill in each exercise on the next page, and your work is saved as you go.</p>
        <label className="field">
          <span className="field-label">Title</span>
          <input type="text" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Subject</span>
          <select value={subj} onChange={(e) => setSubject(e.target.value)}>
            {subjects.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <div className="field-row">
          <label className="field">
            <span className="field-label">From level</span>
            <select value={from} onChange={(e) => setLevelFrom(e.target.value)}>
              {levels.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.code} · {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">To level</span>
            <select value={to} onChange={(e) => setLevelTo(e.target.value)}>
              {levels.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.code} · {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            <span className="field-label">How long it takes (minutes)</span>
            <input type="number" min={1} max={180} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Number of exercises</span>
            <input type="number" min={1} max={MAX_STEPS} value={exercises} onChange={(e) => setExercises(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Start every exercise as</span>
            <select value={firstType} onChange={(e) => setFirstType(e.target.value)}>
              {STEP_TYPES.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted">You can change the kind of each exercise, and the number of exercises, later.</p>
        {problems.length > 0 && title.trim() !== '' && (
          <ul className="problems" aria-label="Problems">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {error && <ErrorPanel error={error} />}
        <div className="button-row">
          <button type="submit" className="btn btn-primary" disabled={busy || problems.length > 0}>
            {busy ? 'Creating…' : 'Create and start building'}
          </button>
          <Link className="btn" to="/activities">
            Cancel
          </Link>
        </div>
      </form>
    </>
  )
}
