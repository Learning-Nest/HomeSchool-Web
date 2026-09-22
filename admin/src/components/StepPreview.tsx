import { useState } from 'react'
import { previewSteps, STEP_TYPE_LABELS, type LabelledItem, type PreviewStep } from '../domain/steps'

function minutesAndSeconds(total: number): string {
  const m = Math.floor(total / 60)
  const s = total % 60
  return m > 0 ? `${m} min${s ? ` ${s} s` : ''}` : `${s} s`
}

function ItemList({ items, className }: { items: LabelledItem[]; className?: string }) {
  return (
    <ul className={className ?? 'preview-options'}>
      {items.map((item) => (
        <li key={item.id}>{item.label}</li>
      ))}
    </ul>
  )
}

function StepBody({ step }: { step: PreviewStep }) {
  switch (step.type) {
    case 'instruction':
      return <p className="preview-text">{step.text}</p>
    case 'media_prompt':
      return (
        <figure className="preview-media">
          <div className="media-box" role="img" aria-label={step.altText ?? 'Picture without a description'}>
            Picture: {step.altText ?? '(no alt text)'}
          </div>
          {step.caption && <figcaption>{step.caption}</figcaption>}
        </figure>
      )
    case 'single_choice':
    case 'multi_choice':
      return (
        <>
          <p className="preview-text">{step.prompt}</p>
          <ul className={`preview-options choice-${step.type}`}>
            {(step.options ?? []).map((o) => (
              <li key={o.id}>{o.label}</li>
            ))}
          </ul>
        </>
      )
    case 'numeric_input':
      return (
        <>
          <p className="preview-text">{step.prompt}</p>
          <div className="fake-input">Type a number</div>
        </>
      )
    case 'short_text':
      return (
        <>
          <p className="preview-text">{step.prompt}</p>
          <div className="fake-input">Type your answer{step.maxLen ? ` (up to ${step.maxLen} characters)` : ''}</div>
        </>
      )
    case 'sequence_order':
      return (
        <>
          <p className="preview-text">{step.prompt}</p>
          <ItemList items={step.items ?? []} />
          <p className="preview-note">The child drags these into order.</p>
        </>
      )
    case 'match_pairs':
      return (
        <>
          <p className="preview-text">{step.prompt}</p>
          <div className="pair-columns">
            <ItemList items={step.left ?? []} />
            <ItemList items={step.right ?? []} />
          </div>
        </>
      )
    case 'timer_task':
      return (
        <>
          <p className="preview-text">{step.prompt}</p>
          <p className="preview-note">Countdown: {step.durationSec ? minutesAndSeconds(step.durationSec) : 'not set'}</p>
          {step.checklist && step.checklist.length > 0 && (
            <ul className="preview-options">
              {step.checklist.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
        </>
      )
    case 'reflection':
      return (
        <>
          <p className="preview-text">{step.prompt}</p>
          <p className="emoji-row" aria-label="Choices">
            {(step.emojiOptions ?? []).map((e, i) => (
              <span key={i}>{e}</span>
            ))}
          </p>
        </>
      )
    case 'audio_record':
    case 'photo_evidence':
      return (
        <>
          <p className="preview-text">{step.prompt}</p>
          <p className="preview-note">
            Done with a grown-up; the child can mark it done or skip
            {step.type === 'audio_record' && step.maxSeconds ? ` (up to ${step.maxSeconds} s)` : ''}
            {step.optional ? '. Optional.' : '.'}
          </p>
        </>
      )
    case 'parent_checklist':
      return (
        <>
          <p className="preview-text">{step.prompt}</p>
          <p className="preview-note">
            Not shown to the child. A parent rates {step.skillCode ?? 'the skill'} after the activity
            {step.ratingOptions ? ` (${step.ratingOptions.join(', ')})` : ''}.
          </p>
        </>
      )
    default:
      return <p className="preview-note">This step could not be read. Check its "type" and required fields.</p>
  }
}

export function StepPreview({ definition }: { definition: unknown }) {
  const [showAnswers, setShowAnswers] = useState(false)
  const steps = previewSteps(definition)
  const title =
    typeof definition === 'object' && definition !== null && 'title' in definition && typeof definition.title === 'string'
      ? definition.title
      : 'Untitled activity'

  return (
    <section className="preview" aria-labelledby="preview-heading">
      <div className="preview-header">
        <h2 id="preview-heading">How a child sees it</h2>
        <label className="check">
          <input type="checkbox" checked={showAnswers} onChange={(e) => setShowAnswers(e.target.checked)} />
          Show answer keys
        </label>
      </div>
      <p className="preview-title">{title}</p>
      {steps.length === 0 ? (
        <p className="muted">No steps to show yet.</p>
      ) : (
        <ol className="preview-steps">
          {steps.map((step, i) => (
            <li key={`${step.id}-${i}`} className="preview-step">
              <p className="preview-step-head">
                <span className="preview-step-type">{STEP_TYPE_LABELS[step.type] ?? step.type}</span>
                <code className="preview-step-id">{step.id}</code>
              </p>
              <StepBody step={step} />
              {step.hint && (
                <details className="preview-hint">
                  <summary>Hint</summary>
                  {step.hint}
                </details>
              )}
              {showAnswers && step.answers.length > 0 && (
                <div className="answer-key">
                  <strong>Answer key:</strong>{' '}
                  {step.answers.map((a, j) => (
                    <span key={j} className="answer-chip">
                      {a}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
