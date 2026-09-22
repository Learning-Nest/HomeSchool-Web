import { useCallback, useEffect, useState } from 'react'
import { Link, useBlocker, useParams } from 'react-router-dom'
import type { ActivityStatus, AdminActivityDetail } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorPanel } from '../components/ErrorPanel'
import { JsonEditor } from '../components/JsonEditor'
import { Loading } from '../components/Loading'
import { StatusBadge } from '../components/StatusBadge'
import { StepPreview } from '../components/StepPreview'
import { formatJson, parseJsonObject, type JsonObjectResult } from '../domain/json'
import { legalTransitions, needsConfirmation, statusLabel, transitionLabel } from '../domain/status'
import { formatDateTime, levelRange } from '../format'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useRequest } from '../hooks/useRequest'

export function ActivityEditorPage() {
  const { id = '' } = useParams()
  const { api } = useAuth()
  const load = useCallback((signal: AbortSignal) => api.getActivity(id, signal), [api, id])
  const { data, error, reload } = useRequest(load)
  useDocumentTitle(data?.title ?? 'Activity')

  return (
    <>
      <p className="breadcrumb">
        <Link to="/activities">← All activities</Link>
      </p>
      {error && <ErrorPanel error={error} onRetry={reload} messages={{ not_found: 'This activity does not exist.' }} />}
      {!error && (!data || data.id !== id) && <Loading label="Loading activity…" />}
      {!error && data && data.id === id && <ActivityEditor key={data.id} initial={data} />}
    </>
  )
}

/** The outcome of the last save or status change, shown next to the control that caused it. */
type Feedback = { ok: string } | { error: Error } | null

function FeedbackView({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null
  if ('error' in feedback) return <ErrorPanel error={feedback.error} />
  return (
    <p className="panel panel-success" role="status">
      {feedback.ok}
    </p>
  )
}

interface Draft {
  text: string
  result: JsonObjectResult
}

function draftOf(text: string): Draft {
  return { text, result: parseJsonObject(text) }
}

function ActivityEditor({ initial }: { initial: AdminActivityDetail }) {
  const { api } = useAuth()
  const [detail, setDetail] = useState(initial)
  const baseline = formatJson(detail.definition)
  const [draft, setDraft] = useState(() => draftOf(baseline))
  // The preview keeps showing the last readable definition while the text is mid-edit and invalid.
  const [previewOf, setPreviewOf] = useState<Record<string, unknown>>(initial.definition)
  const [saving, setSaving] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState<Feedback>(null)
  const [statusFeedback, setStatusFeedback] = useState<Feedback>(null)
  const [pendingStatus, setPendingStatus] = useState<ActivityStatus | null>(null)
  const [changingStatus, setChangingStatus] = useState(false)

  const dirty = draft.text !== baseline
  // Signing out (or an expired session) navigates to /login on purpose; that must not raise the prompt.
  const blocker = useBlocker(({ nextLocation }) => dirty && nextLocation.pathname !== '/login')

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function edit(text: string) {
    const next = draftOf(text)
    setDraft(next)
    if (next.result.ok) setPreviewOf(next.result.value)
    setSaveFeedback(null)
  }

  function format() {
    if (draft.result.ok) edit(formatJson(draft.result.value))
  }

  async function save() {
    if (!draft.result.ok) return
    setSaving(true)
    setSaveFeedback(null)
    try {
      const updated = await api.putDefinition(detail.id, draft.result.value)
      setDetail(updated)
      setDraft(draftOf(formatJson(updated.definition)))
      setPreviewOf(updated.definition)
      setSaveFeedback({ ok: `Saved. This is version ${updated.version}.` })
    } catch (e) {
      setSaveFeedback({ error: e instanceof Error ? e : new Error(String(e)) })
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(target: ActivityStatus) {
    setChangingStatus(true)
    setStatusFeedback(null)
    try {
      const updated = await api.setStatus(detail.id, target)
      setDetail(updated)
      setStatusFeedback({ ok: `Status is now ${statusLabel(updated.status)}.` })
    } catch (e) {
      setStatusFeedback({ error: e instanceof Error ? e : new Error(String(e)) })
    } finally {
      setChangingStatus(false)
      setPendingStatus(null)
    }
  }

  const transitions = legalTransitions(detail.status)
  const saveBlockedReason = draft.result.ok ? null : 'Fix the JSON syntax error first.'

  return (
    <>
      <header className="editor-head">
        <h1>{detail.title}</h1>
        <StatusBadge status={detail.status} />
      </header>
      <dl className="meta">
        <div>
          <dt>Slug</dt>
          <dd>
            <code>{detail.slug}</code>
          </dd>
        </div>
        <div>
          <dt>Subject</dt>
          <dd>{detail.subject_code}</dd>
        </div>
        <div>
          <dt>Levels</dt>
          <dd>{levelRange(detail.level_from, detail.level_to)}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{detail.duration_min} min</dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>{detail.version}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>
            <time dateTime={detail.updated_at}>{formatDateTime(detail.updated_at)}</time>
          </dd>
        </div>
        <div>
          <dt>Skills</dt>
          <dd>{detail.skills.join(', ') || 'none'}</dd>
        </div>
      </dl>

      <section className="panel" aria-labelledby="status-heading">
        <h2 id="status-heading">Status: {statusLabel(detail.status)}</h2>
        {transitions.length === 0 ? (
          <p className="muted">No status changes are available.</p>
        ) : (
          <div className="button-row">
            {transitions.map((target) => (
              <button
                key={target}
                type="button"
                className={target === 'published' ? 'btn btn-primary' : 'btn'}
                disabled={dirty || changingStatus}
                aria-describedby={dirty ? 'status-hint' : undefined}
                onClick={() => (needsConfirmation(target) ? setPendingStatus(target) : void changeStatus(target))}
              >
                {transitionLabel(detail.status, target)}
              </button>
            ))}
          </div>
        )}
        {dirty && (
          <p id="status-hint" className="muted">
            Save or revert your edits before changing the status: publishing checks the saved definition.
          </p>
        )}
        <FeedbackView feedback={statusFeedback} />
      </section>

      <div className="editor-grid">
        <section aria-labelledby="definition-heading">
          <h2 id="definition-heading">Definition</h2>
          <p className="muted">
            The full activity definition, including answer keys, as defined by the activity content schema. The slug
            cannot be changed.
          </p>
          <JsonEditor
            id="definition"
            label="Definition JSON"
            value={draft.text}
            onChange={edit}
            error={draft.result.ok ? null : draft.result.error}
            disabled={saving}
          />
          <div className="button-row">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void save()}
              disabled={saving || !dirty || !draft.result.ok}
              aria-describedby={saveBlockedReason ? 'save-hint' : undefined}
            >
              {saving ? 'Saving…' : 'Save definition'}
            </button>
            <button type="button" className="btn" onClick={format} disabled={!draft.result.ok || saving}>
              Format
            </button>
            <button type="button" className="btn" onClick={() => edit(baseline)} disabled={!dirty || saving}>
              Revert
            </button>
            {dirty && <span className="muted">Unsaved changes</span>}
          </div>
          {saveBlockedReason && (
            <p id="save-hint" className="visually-hidden">
              {saveBlockedReason}
            </p>
          )}
          <FeedbackView feedback={saveFeedback} />
        </section>
        <StepPreview definition={previewOf} />
      </div>

      {pendingStatus && (
        <ConfirmDialog
          title={pendingStatus === 'published' ? 'Publish this activity?' : 'Archive this activity?'}
          confirmLabel={pendingStatus === 'published' ? 'Publish' : 'Archive'}
          danger={pendingStatus === 'archived'}
          busy={changingStatus}
          onConfirm={() => void changeStatus(pendingStatus)}
          onCancel={() => setPendingStatus(null)}
        >
          {pendingStatus === 'published' ? (
            <p>
              “{detail.title}” becomes visible to children in the app. The server first checks it against the current
              curriculum and refuses to publish it if it does not pass.
            </p>
          ) : (
            <p>
              “{detail.title}” is hidden from children. You can restore it as a draft later.
            </p>
          )}
        </ConfirmDialog>
      )}
      {blocker.state === 'blocked' && (
        <ConfirmDialog
          title="Discard unsaved changes?"
          confirmLabel="Discard and leave"
          cancelLabel="Keep editing"
          danger
          onConfirm={() => blocker.proceed()}
          onCancel={() => blocker.reset()}
        >
          <p>Your edits to the definition have not been saved.</p>
        </ConfirmDialog>
      )}
    </>
  )
}
