import { useCallback, useState, type FormEvent } from 'react'
import type { PolicyScope, ReleasePolicy, ReleasePolicyValues } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorPanel } from '../components/ErrorPanel'
import { Loading } from '../components/Loading'
import { formatDateTime } from '../format'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useRequest } from '../hooks/useRequest'

export const WEEKDAYS: [number, string][] = [
  [1, 'Mon'],
  [2, 'Tue'],
  [3, 'Wed'],
  [4, 'Thu'],
  [5, 'Fri'],
  [6, 'Sat'],
  [7, 'Sun'],
]

export const DEFAULT_VALUES: ReleasePolicyValues = {
  release_threshold: 0.7,
  set_minutes: 45,
  set_max_activities: 5,
  max_open_items: 10,
  school_days: [1, 2, 3, 4, 5, 6, 7],
  strong_score: 0.85,
  revision_open_cap: 5,
  revision_cooldown_days: 1,
  child_daily_practice_limit: 3,
}

export function scopeLabel(scope: PolicyScope): string {
  if (!scope.board) return 'Everyone (default)'
  return scope.grade ? `${scope.board}, grade ${scope.grade}` : `${scope.board}, every grade`
}

export function daysLabel(days: number[]): string {
  if (days.length === 7) return 'Every day'
  return WEEKDAYS.filter(([n]) => days.includes(n))
    .map(([, name]) => name)
    .join(', ')
}

const pct = (n: number) => Math.round(n * 100)

/** The form keeps the percentages as whole numbers, like the people who fill it in think of them. */
interface FormState extends Omit<ReleasePolicyValues, 'release_threshold' | 'strong_score'> {
  threshold_pct: number
  strong_pct: number
}

function toForm(v: ReleasePolicyValues): FormState {
  const { release_threshold, strong_score, ...rest } = v
  return { ...rest, threshold_pct: pct(release_threshold), strong_pct: pct(strong_score) }
}

function fromForm(f: FormState): ReleasePolicyValues {
  const { threshold_pct, strong_pct, ...rest } = f
  return { ...rest, release_threshold: threshold_pct / 100, strong_score: strong_pct / 100 }
}

export function ReleaseSettingsPage() {
  useDocumentTitle('Release settings')
  const { api, isSuperAdmin } = useAuth()
  const load = useCallback((signal: AbortSignal) => api.releasePolicies(signal), [api])
  const loadBoards = useCallback((signal: AbortSignal) => api.boards(signal), [api])
  const { data, error, reload } = useRequest(load)
  const { data: boards } = useRequest(loadBoards)

  const [scope, setScope] = useState<PolicyScope | null>(null)
  const [form, setForm] = useState<FormState>(toForm(DEFAULT_VALUES))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<Error | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [removing, setRemoving] = useState<ReleasePolicy | null>(null)
  const [removeBusy, setRemoveBusy] = useState(false)
  const [removeError, setRemoveError] = useState<Error | null>(null)

  function edit(policy: ReleasePolicy) {
    setScope({ board: policy.scope_board, grade: policy.scope_grade })
    setForm(toForm(policy))
    setNotice(null)
    setSaveError(null)
  }

  function startOverride() {
    const base = data?.find((p) => p.scope_board === '' && p.scope_grade === '')
    setScope({ board: boards?.[0]?.code ?? '', grade: '' })
    setForm(toForm(base ?? DEFAULT_VALUES))
    setNotice(null)
    setSaveError(null)
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function toggleDay(day: number) {
    set('school_days', form.school_days.includes(day) ? form.school_days.filter((d) => d !== day) : [...form.school_days, day].sort())
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!scope) return
    setSaving(true)
    setSaveError(null)
    try {
      const saved = await api.saveReleasePolicy({ board: scope.board, grade: scope.grade.trim() }, fromForm(form))
      setNotice(`Saved the settings for ${scopeLabel({ board: saved.scope_board, grade: saved.scope_grade })}. Children get them from their next release.`)
      setScope(null)
      reload()
    } catch (e) {
      setSaveError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setSaving(false)
    }
  }

  async function confirmRemove() {
    if (!removing) return
    setRemoveBusy(true)
    setRemoveError(null)
    try {
      await api.deleteReleasePolicy({ board: removing.scope_board, grade: removing.scope_grade })
      setNotice(`Removed the override for ${scopeLabel({ board: removing.scope_board, grade: removing.scope_grade })}.`)
      setRemoving(null)
      reload()
    } catch (e) {
      setRemoveError(e instanceof Error ? e : new Error(String(e)))
      setRemoving(null)
    } finally {
      setRemoveBusy(false)
    }
  }

  const isDefault = scope !== null && scope.board === '' && scope.grade === ''
  const noDays = form.school_days.length === 0

  return (
    <>
      <h1>Release settings</h1>
      <p className="muted">
        How LearnNest releases activities to families that are in “LearnNest chooses” mode. A new set is released once enough of the
        last set is done. The most specific row wins: board and grade, then the board, then the default.
      </p>

      {notice && (
        <p className="panel panel-success" role="status">
          {notice}
        </p>
      )}
      {removeError && <ErrorPanel error={removeError} />}
      {error && <ErrorPanel error={error} onRetry={reload} />}
      {!error && !data && <Loading label="Loading settings…" />}

      {!error && data && (
        <div className="table-wrap" role="region" aria-label="Release settings table" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th scope="col">Applies to</th>
                <th scope="col" className="num">
                  New set at
                </th>
                <th scope="col" className="num">
                  Activities
                </th>
                <th scope="col" className="num">
                  Minutes
                </th>
                <th scope="col" className="num">
                  Open limit
                </th>
                <th scope="col">School days</th>
                <th scope="col">Updated</th>
                {isSuperAdmin && <th scope="col">Change</th>}
              </tr>
            </thead>
            <tbody>
              {data.map((p) => {
                const key = `${p.scope_board}/${p.scope_grade}`
                const label = scopeLabel({ board: p.scope_board, grade: p.scope_grade })
                return (
                  <tr key={key}>
                    <th scope="row">{label}</th>
                    <td className="num">{pct(p.release_threshold)}%</td>
                    <td className="num">{p.set_max_activities}</td>
                    <td className="num">{p.set_minutes}</td>
                    <td className="num">{p.max_open_items}</td>
                    <td>{daysLabel(p.school_days)}</td>
                    <td>{p.updated_at ? <time dateTime={p.updated_at}>{formatDateTime(p.updated_at)}</time> : '—'}</td>
                    {isSuperAdmin && (
                      <td>
                        <button type="button" className="btn btn-small" onClick={() => edit(p)}>
                          Edit<span className="visually-hidden"> {label}</span>
                        </button>
                        {(p.scope_board !== '' || p.scope_grade !== '') && (
                          <>
                            {' '}
                            <button type="button" className="btn btn-small" onClick={() => setRemoving(p)}>
                              Remove<span className="visually-hidden"> {label}</span>
                            </button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {isSuperAdmin && data && !scope && (
        <p>
          <button type="button" className="btn" onClick={startOverride}>
            Add settings for a board or grade
          </button>
        </p>
      )}
      {!isSuperAdmin && data && <p className="muted">Only a super admin can change these settings.</p>}

      {isSuperAdmin && scope && (
        <section className="panel" aria-labelledby="edit-heading">
          <h2 id="edit-heading">Settings for {scopeLabel(scope)}</h2>
          <form onSubmit={save}>
            {!isDefault && (
              <div className="field-row">
                <label className="field">
                  <span className="field-label">Board</span>
                  <select value={scope.board} onChange={(e) => setScope({ ...scope, board: e.target.value })} required>
                    <option value="" disabled>
                      Choose a board
                    </option>
                    {(boards ?? []).map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Grade (empty = every grade)</span>
                  <input type="text" maxLength={20} value={scope.grade} onChange={(e) => setScope({ ...scope, grade: e.target.value })} />
                </label>
              </div>
            )}
            <div className="field-row">
              <label className="field">
                <span className="field-label">Release a new set when this much of the last one is done (%)</span>
                <input type="number" min={1} max={100} required value={form.threshold_pct} onChange={(e) => set('threshold_pct', Number(e.target.value))} />
              </label>
              <label className="field">
                <span className="field-label">Most activities in a set</span>
                <input type="number" min={1} max={30} required value={form.set_max_activities} onChange={(e) => set('set_max_activities', Number(e.target.value))} />
              </label>
              <label className="field">
                <span className="field-label">Most minutes in a set</span>
                <input type="number" min={5} max={600} required value={form.set_minutes} onChange={(e) => set('set_minutes', Number(e.target.value))} />
              </label>
              <label className="field">
                <span className="field-label">Stop releasing above this many open activities</span>
                <input type="number" min={1} max={100} required value={form.max_open_items} onChange={(e) => set('max_open_items', Number(e.target.value))} />
              </label>
            </div>
            <fieldset className="field">
              <legend className="field-label">School days</legend>
              {WEEKDAYS.map(([n, name]) => (
                <label key={n} className="check-inline">
                  <input type="checkbox" checked={form.school_days.includes(n)} onChange={() => toggleDay(n)} /> {name}
                </label>
              ))}
              {noDays && <p className="field-error">Choose at least one day.</p>}
            </fieldset>
            <div className="field-row">
              <label className="field">
                <span className="field-label">“Strong” score from (%)</span>
                <input type="number" min={1} max={100} required value={form.strong_pct} onChange={(e) => set('strong_pct', Number(e.target.value))} />
              </label>
              <label className="field">
                <span className="field-label">Practice items open at once</span>
                <input type="number" min={0} max={50} required value={form.revision_open_cap} onChange={(e) => set('revision_open_cap', Number(e.target.value))} />
              </label>
              <label className="field">
                <span className="field-label">Days before an activity can be practised again</span>
                <input type="number" min={0} max={60} required value={form.revision_cooldown_days} onChange={(e) => set('revision_cooldown_days', Number(e.target.value))} />
              </label>
              <label className="field">
                <span className="field-label">Practice a child can add per day</span>
                <input type="number" min={0} max={20} required value={form.child_daily_practice_limit} onChange={(e) => set('child_daily_practice_limit', Number(e.target.value))} />
              </label>
            </div>
            {saveError && <ErrorPanel error={saveError} />}
            <p>
              <button type="submit" className="btn btn-primary" disabled={saving || noDays || (!isDefault && !scope.board)}>
                {saving ? 'Saving…' : 'Save settings'}
              </button>{' '}
              <button type="button" className="btn" onClick={() => setScope(null)} disabled={saving}>
                Cancel
              </button>
            </p>
          </form>
        </section>
      )}

      {removing && (
        <ConfirmDialog
          title={`Remove the settings for ${scopeLabel({ board: removing.scope_board, grade: removing.scope_grade })}?`}
          confirmLabel="Remove"
          danger
          busy={removeBusy}
          onConfirm={() => void confirmRemove()}
          onCancel={() => setRemoving(null)}
        >
          <p>Children of this scope fall back to the next broader settings from their next release.</p>
        </ConfirmDialog>
      )}
    </>
  )
}
