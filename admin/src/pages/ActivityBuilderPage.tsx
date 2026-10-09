import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useBlocker, useParams } from 'react-router-dom'
import type { AdminActivityDetail, AssetInfo, Level, Skill, Subject, ValidationResult } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { BuilderProvider, type BuilderEnv } from '../components/builder/BuilderContext'
import { StepCard } from '../components/builder/StepCard'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorPanel } from '../components/ErrorPanel'
import { Loading } from '../components/Loading'
import { StatusBadge } from '../components/StatusBadge'
import { StepPreview } from '../components/StepPreview'
import {
  addStep,
  duplicateStep,
  fingerprint,
  MAX_STEPS,
  moveStep,
  removalImpact,
  removeStep,
  replaceStep,
  resizeSteps,
  STEP_TYPES,
  toDefinition,
  type Definition,
  type Step,
} from '../domain/builder'
import { formatDateTime } from '../format'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useRequest } from '../hooks/useRequest'

/** How long after the last keystroke a draft is saved by itself. */
export const AUTOSAVE_DELAY_MS = 1500
/** Signed picture links last an hour; ask for fresh ones well before that. */
const ASSET_REFRESH_MS = 40 * 60 * 1000

export function ActivityBuilderPage() {
  const { id = '' } = useParams()
  const { api } = useAuth()
  const load = useCallback((signal: AbortSignal) => api.getActivity(id, signal), [api, id])
  const { data, error, reload } = useRequest(load)
  const loadSkills = useCallback((signal: AbortSignal) => api.skills({}, signal), [api])
  const { data: skills } = useRequest(loadSkills)
  const loadSubjects = useCallback((signal: AbortSignal) => api.subjects(signal), [api])
  const { data: subjects } = useRequest(loadSubjects)
  const loadLevels = useCallback((signal: AbortSignal) => api.levels(signal), [api])
  const { data: levels } = useRequest(loadLevels)
  const loadAssets = useCallback((signal: AbortSignal) => api.listAssets(id, signal), [api, id])
  const { data: assets } = useRequest(loadAssets)
  useDocumentTitle(data?.title ? `Build: ${data.title}` : 'Build an activity')

  const ready = data && data.id === id && skills && subjects && levels && assets
  return (
    <>
      <p className="breadcrumb">
        <Link to="/activities">← All activities</Link>
      </p>
      {error && <ErrorPanel error={error} onRetry={reload} messages={{ not_found: 'This activity does not exist, or it is not yours.' }} />}
      {!error && !ready && <Loading label="Loading activity…" />}
      {!error && ready && (
        <Builder key={data.id} initial={data} skills={skills} subjects={subjects} levels={levels} initialAssets={assets} />
      )}
    </>
  )
}

type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: Date } | { kind: 'error'; error: Error }

interface Checked {
  result: ValidationResult
  /** The content that was checked; any later edit makes the result stale. */
  fingerprint: string
}

interface BuilderProps {
  initial: AdminActivityDetail
  skills: Skill[]
  subjects: Subject[]
  levels: Level[]
  initialAssets: AssetInfo[]
}

function Builder({ initial, skills, subjects, levels, initialAssets }: BuilderProps) {
  const { api, isAdmin } = useAuth()
  const startDef = useMemo(() => toDefinition(initial.definition), [initial.definition])
  const [detail, setDetail] = useState(initial)
  const [def, setDef] = useState<Definition | null>(startDef)
  const [baseline, setBaseline] = useState(() => (startDef ? fingerprint(startDef) : ''))
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' })
  const [checked, setChecked] = useState<Checked | null>(null)
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState<Error | null>(null)
  const [assets, setAssets] = useState(initialAssets)
  const [newType, setNewType] = useState('single_choice')
  const [count, setCount] = useState(String(startDef?.steps.length ?? 1))
  const [pendingResize, setPendingResize] = useState<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<Error | null>(null)

  const defRef = useRef(def)
  useEffect(() => {
    defRef.current = def
  }, [def])
  const savingRef = useRef(false)

  const editable = detail.status === 'draft' && def !== null
  const current = def ? fingerprint(def) : ''
  const dirty = def !== null && current !== baseline
  const fresh = checked !== null && checked.fingerprint === current && !dirty
  const saving = saveState.kind === 'saving'

  // ---- saving -------------------------------------------------------------------------------------------------
  const save = useCallback(async (): Promise<boolean> => {
    const sending = defRef.current
    if (!sending) return true
    if (savingRef.current) return false
    const sent = fingerprint(sending)
    savingRef.current = true
    setSaveState({ kind: 'saving' })
    try {
      const updated = await api.putDefinition(initial.id, sending as unknown as Record<string, unknown>, { strict: false })
      setDetail(updated)
      setBaseline(sent)
      setSaveState({ kind: 'saved', at: new Date() })
      return true
    } catch (e) {
      setSaveState({ kind: 'error', error: e instanceof Error ? e : new Error(String(e)) })
      return false
    } finally {
      savingRef.current = false
    }
  }, [api, initial.id])

  useEffect(() => {
    if (!editable || !dirty || saving || saveState.kind === 'error') return
    const timer = window.setTimeout(() => void save(), AUTOSAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [editable, dirty, saving, saveState.kind, current, save])

  // Keeps the preview links of the pictures valid.
  useEffect(() => {
    const timer = window.setInterval(() => {
      api.listAssets(initial.id).then(setAssets, () => undefined)
    }, ASSET_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [api, initial.id])

  const blocker = useBlocker(({ nextLocation }) => editable && dirty && nextLocation.pathname !== '/login')
  useEffect(() => {
    if (!editable || !dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [editable, dirty])

  // ---- editing ------------------------------------------------------------------------------------------------
  function change(next: Definition) {
    setDef(next)
    setCount(String(next.steps.length))
    setSaveState((s) => (s.kind === 'error' ? { kind: 'idle' } : s))
  }

  const env = useMemo<BuilderEnv>(
    () => ({
      assets,
      skills,
      readOnly: !editable,
      upload: async (file) => {
        const uploaded = await api.uploadAsset(initial.id, file)
        setAssets((list) => (list.some((a) => a.id === uploaded.id) ? list.map((a) => (a.id === uploaded.id ? uploaded : a)) : [...list, uploaded]))
        return uploaded
      },
    }),
    [assets, skills, editable, api, initial.id],
  )

  const imageUrls = useMemo(() => {
    const urls: Record<string, string> = {}
    for (const a of assets) if (a.url) urls[a.id] = a.url
    return urls
  }, [assets])

  // ---- checking and submitting --------------------------------------------------------------------------------
  async function validate() {
    setChecking(true)
    setCheckError(null)
    try {
      if (dirty && !(await save())) return
      const sent = defRef.current ? fingerprint(defRef.current) : ''
      const result = await api.validateActivity(initial.id)
      setChecked({ result, fingerprint: sent })
      setDetail((d) => ({ ...d, is_validated: result.ok, last_validated_at: result.validated_at ?? d.last_validated_at }))
    } catch (e) {
      setCheckError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setChecking(false)
    }
  }

  async function submit() {
    setSubmitting(true)
    setSubmitError(null)
    try {
      setDetail(await api.submitActivity(initial.id))
      setConfirmSubmit(false)
    } catch (e) {
      setSubmitError(e instanceof Error ? e : new Error(String(e)))
      setConfirmSubmit(false)
    } finally {
      setSubmitting(false)
    }
  }

  const problemsByStep = useMemo(() => {
    const map = new Map<string, string[]>()
    if (!checked || checked.fingerprint !== current) return map
    for (const p of checked.result.problems) {
      if (!p.step) continue
      map.set(p.step, [...(map.get(p.step) ?? []), p.message])
    }
    return map
  }, [checked, current])
  const generalProblems = checked && checked.fingerprint === current ? checked.result.problems.filter((p) => !p.step) : []

  if (!def) {
    return (
      <>
        <h1>{detail.title}</h1>
        <div className="panel panel-info" role="status">
          <p>
            This activity uses an older format that the guided builder cannot edit.
            {isAdmin ? (
              <>
                {' '}
                <Link to={`/activities/${detail.id}`}>Open it in the JSON editor</Link>.
              </>
            ) : (
              ' Ask an administrator to update it.'
            )}
          </p>
        </div>
      </>
    )
  }

  const subject = def.subject
  const statusNote = noteFor(detail)

  return (
    <BuilderProvider env={env}>
      <header className="editor-head">
        <h1>{def.title?.trim() || 'Untitled activity'}</h1>
        <StatusBadge status={detail.status} />
        {isAdmin && (
          <Link className="btn btn-small" to={`/activities/${detail.id}`}>
            Admin view
          </Link>
        )}
      </header>

      <AuthorshipLine detail={detail} />

      {statusNote && (
        <div className={`panel ${statusNote.tone === 'warn' ? 'panel-warn' : 'panel-info'}`} role="status">
          <p className="panel-title">{statusNote.title}</p>
          {statusNote.text && <p className="note-text">{statusNote.text}</p>}
        </div>
      )}

      <div className="save-status" role="status" aria-live="polite">
        <SaveIndicator state={saveState} dirty={dirty} editable={editable} onRetry={() => void save()} />
      </div>

      <div className="editor-grid">
        <div className="builder-main">
          <section className="panel" aria-labelledby="about-heading">
            <h2 id="about-heading">About this activity</h2>
            <label className="field">
              <span className="field-label">Title</span>
              <input
                type="text"
                maxLength={120}
                value={def.title ?? ''}
                disabled={!editable}
                onChange={(e) => change({ ...def, title: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field-label">One-line summary (shown in the library)</span>
              <textarea
                rows={2}
                maxLength={400}
                value={def.summary ?? ''}
                disabled={!editable}
                onChange={(e) => change({ ...def, summary: e.target.value })}
              />
            </label>
            <div className="field-row">
              <label className="field">
                <span className="field-label">Subject</span>
                <select value={def.subject ?? ''} disabled={!editable} onChange={(e) => change({ ...def, subject: e.target.value })}>
                  {subjects.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">From level</span>
                <select value={def.level_from ?? ''} disabled={!editable} onChange={(e) => change({ ...def, level_from: e.target.value })}>
                  {levels.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.code} · {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">To level</span>
                <select value={def.level_to ?? ''} disabled={!editable} onChange={(e) => change({ ...def, level_to: e.target.value })}>
                  {levels.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.code} · {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Minutes</span>
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={def.duration_min ?? ''}
                  disabled={!editable}
                  onChange={(e) => {
                    const n = Math.round(Number(e.target.value))
                    change({ ...def, duration_min: Number.isFinite(n) && e.target.value !== '' ? n : undefined })
                  }}
                />
              </label>
            </div>
            <label className="field">
              <span className="field-label">Materials needed (one per line, optional)</span>
              <MaterialsField value={def.materials ?? []} disabled={!editable} onChange={(materials) => change({ ...def, materials })} />
            </label>
            <p className="muted">
              Web address name: <code>{detail.slug}</code> (it cannot be changed).
            </p>
          </section>

          <section aria-labelledby="exercises-heading">
            <div className="section-head">
              <h2 id="exercises-heading">Exercises ({def.steps.length})</h2>
              {editable && (
                <form
                  className="resize-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const target = Math.round(Number(count))
                    if (!Number.isFinite(target) || target < 1 || target > MAX_STEPS || target === def.steps.length) return
                    if (target < def.steps.length && removalImpact(def, target).withContent > 0) setPendingResize(target)
                    else change(resizeSteps(def, target, newType))
                  }}
                >
                  <label className="field field-inline">
                    <span className="field-label">Number of exercises</span>
                    <input type="number" min={1} max={MAX_STEPS} value={count} onChange={(e) => setCount(e.target.value)} />
                  </label>
                  <button type="submit" className="btn btn-small" disabled={Number(count) === def.steps.length}>
                    Set number
                  </button>
                </form>
              )}
            </div>

            {def.steps.length > 1 && (
              <nav aria-label="Jump to an exercise" className="step-jump">
                {def.steps.map((s, i) => (
                  <a key={s.id} href={`#step-${s.id}`} className={problemsByStep.has(s.id) ? 'has-problems' : undefined}>
                    {i + 1}
                    {problemsByStep.has(s.id) && <span className="visually-hidden"> (has problems)</span>}
                  </a>
                ))}
              </nav>
            )}

            {def.steps.map((step, i) => (
              <StepCard
                key={step.id}
                step={step}
                index={i}
                count={def.steps.length}
                subject={subject}
                problems={problemsByStep.get(step.id) ?? []}
                onChange={(next: Step) => change(replaceStep(def, i, next))}
                onMove={(offset) => change(moveStep(def, i, i + offset))}
                onDuplicate={() => change(duplicateStep(def, i))}
                onRemove={() => setPendingDelete(i)}
              />
            ))}

            {editable && (
              <div className="add-step">
                <label className="field field-inline">
                  <span className="field-label">New exercise</span>
                  <select value={newType} onChange={(e) => setNewType(e.target.value)}>
                    {STEP_TYPES.map((t) => (
                      <option key={t.type} value={t.type}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="btn" disabled={def.steps.length >= MAX_STEPS} onClick={() => change(addStep(def, newType))}>
                  Add exercise
                </button>
                {def.steps.length >= MAX_STEPS && <span className="muted">An activity can have up to {MAX_STEPS} exercises.</span>}
              </div>
            )}
          </section>

          <section className="panel" aria-labelledby="check-heading">
            <h2 id="check-heading">Check and send for review</h2>
            {editable ? (
              <>
                <p className="muted">
                  Check the activity when you are done. It must pass before you can send it for review. Any change after
                  checking means checking again.
                </p>
                <div className="button-row">
                  <button type="button" className="btn btn-primary" onClick={() => void validate()} disabled={checking || saving}>
                    {checking ? 'Checking…' : 'Check this activity'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setConfirmSubmit(true)}
                    disabled={!fresh || !checked?.result.ok || submitting}
                    aria-describedby="submit-hint"
                  >
                    Send for review
                  </button>
                </div>
                <p id="submit-hint" className="muted">
                  {!checked
                    ? 'Check the activity first.'
                    : dirty || checked.fingerprint !== current
                      ? 'You changed something since the last check. Check again.'
                      : checked.result.ok
                        ? 'It passed. You can send it for review.'
                        : 'Fix the problems below, then check again.'}
                </p>
                {checkError && <ErrorPanel error={checkError} />}
                {submitError && <ErrorPanel error={submitError} />}
                {checked && checked.fingerprint === current && (
                  <ValidationSummary result={checked.result} general={generalProblems} stepIds={def.steps.map((s) => s.id)} />
                )}
              </>
            ) : (
              <p className="muted">This activity can no longer be edited here because it is {detail.status.replace('_', ' ')}.</p>
            )}
          </section>
        </div>

        <StepPreview definition={def} images={imageUrls} />
      </div>

      {pendingResize !== null && (
        <ConfirmDialog
          title="Remove exercises?"
          confirmLabel="Remove them"
          danger
          onConfirm={() => {
            change(resizeSteps(def, pendingResize, newType))
            setPendingResize(null)
          }}
          onCancel={() => setPendingResize(null)}
        >
          <p>
            Going down to {pendingResize} exercises deletes the last {removalImpact(def, pendingResize).removed}, and{' '}
            {removalImpact(def, pendingResize).withContent} of them already have content.
          </p>
        </ConfirmDialog>
      )}
      {pendingDelete !== null && (
        <ConfirmDialog
          title={`Delete exercise ${pendingDelete + 1}?`}
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            change(removeStep(def, pendingDelete))
            setPendingDelete(null)
          }}
          onCancel={() => setPendingDelete(null)}
        >
          <p>This removes the exercise and what you typed into it.</p>
        </ConfirmDialog>
      )}
      {confirmSubmit && (
        <ConfirmDialog
          title="Send this activity for review?"
          confirmLabel="Send for review"
          busy={submitting}
          onConfirm={() => void submit()}
          onCancel={() => setConfirmSubmit(false)}
        >
          <p>
            An administrator will look at “{def.title}”. You cannot edit it while it is in review. If changes are needed
            it comes back to you as a draft with a note.
          </p>
        </ConfirmDialog>
      )}
      {blocker.state === 'blocked' && (
        <ConfirmDialog
          title="Leave without saving?"
          confirmLabel="Leave anyway"
          cancelLabel="Stay"
          danger
          onConfirm={() => blocker.proceed()}
          onCancel={() => blocker.reset()}
        >
          <p>Your latest changes are not saved yet. Wait a moment for “All changes saved” to appear, or leave and lose them.</p>
        </ConfirmDialog>
      )}
    </BuilderProvider>
  )
}

function MaterialsField({ value, disabled, onChange }: { value: string[]; disabled: boolean; onChange(next: string[]): void }) {
  const [text, setText] = useState(() => value.join('\n'))
  return (
    <textarea
      rows={2}
      value={text}
      disabled={disabled}
      onChange={(e) => {
        setText(e.target.value)
        onChange(
          e.target.value
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean),
        )
      }}
    />
  )
}

function SaveIndicator({ state, dirty, editable, onRetry }: { state: SaveState; dirty: boolean; editable: boolean; onRetry(): void }) {
  if (!editable) return null
  if (state.kind === 'error') {
    return (
      <>
        <ErrorPanel error={state.error} onRetry={onRetry} />
        <span className="muted">Your changes are not saved yet.</span>
      </>
    )
  }
  if (state.kind === 'saving') return <span className="muted">Saving…</span>
  if (dirty) return <span className="muted">Unsaved changes…</span>
  if (state.kind === 'saved') return <span className="muted">All changes saved at {state.at.toLocaleTimeString()}.</span>
  return <span className="muted">No changes yet.</span>
}

function ValidationSummary({ result, general, stepIds }: { result: ValidationResult; general: ValidationResult['problems']; stepIds: string[] }) {
  if (result.ok) {
    return (
      <p className="panel panel-success" role="status">
        All checks passed.
      </p>
    )
  }
  return (
    <div className="panel panel-error" role="alert">
      <p className="panel-title">
        {result.problems.length} {result.problems.length === 1 ? 'problem' : 'problems'} to fix
      </p>
      <ul className="problems">
        {result.problems.map((p, i) => (
          <li key={i}>
            {p.step && stepIds.includes(p.step) ? (
              <a href={`#step-${p.step}`}>
                Exercise {stepIds.indexOf(p.step) + 1}
              </a>
            ) : null}
            {p.step && stepIds.includes(p.step) ? ': ' : ''}
            {p.message}
          </li>
        ))}
      </ul>
      {general.length > 0 && <p className="muted">Problems without an exercise number apply to the whole activity.</p>}
    </div>
  )
}

function AuthorshipLine({ detail }: { detail: AdminActivityDetail }) {
  const added = detail.created_by_name
  const edited = detail.last_edited_by_name
  if (!added && !edited) return null
  return (
    <p className="muted authorship">
      {added && (
        <>
          Added by {added}
          {detail.created_at ? ` on ${formatDateTime(detail.created_at)}` : ''}.{' '}
        </>
      )}
      {edited && (
        <>
          Last edited by {edited}
          {detail.last_edited_at ? ` on ${formatDateTime(detail.last_edited_at)}` : ''}.
        </>
      )}
    </p>
  )
}

function noteFor(detail: AdminActivityDetail): { title: string; text?: string; tone: 'info' | 'warn' } | null {
  if (detail.status === 'draft' && detail.review_note) {
    const who = detail.reviewed_by_name ? ` by ${detail.reviewed_by_name}` : ''
    return { title: `Sent back${who} for changes`, text: detail.review_note, tone: 'warn' }
  }
  if (detail.status === 'in_review') return { title: 'Waiting for review. You cannot edit it until the reviewer answers.', tone: 'info' }
  if (detail.status === 'published') return { title: 'Published. It is live in the app and can no longer be edited here.', tone: 'info' }
  if (detail.status === 'archived') return { title: 'Archived.', tone: 'info' }
  return null
}
