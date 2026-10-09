import { useState } from 'react'
import { previewSteps, STEP_TYPE_LABELS, type LabelledItem, type PreviewImage, type PreviewStep } from '../domain/steps'

/** Asset id -> a link the browser can load (the editor gets these from the activity's picture list). */
export type ImageUrls = Readonly<Record<string, string>>

function minutesAndSeconds(total: number): string {
  const m = Math.floor(total / 60)
  const s = total % 60
  return m > 0 ? `${m} min${s ? ` ${s} s` : ''}` : `${s} s`
}

function Picture({ image, urls, className }: { image: PreviewImage; urls: ImageUrls; className?: string }) {
  const src = urls[image.asset]
  if (!src) {
    return (
      <span className={`pic-missing ${className ?? ''}`} role="img" aria-label={image.alt || 'Picture without a description'}>
        Picture not available
      </span>
    )
  }
  return <img className={`pic ${className ?? ''}`} src={src} alt={image.alt} loading="lazy" />
}

function ItemList({ items, className, urls }: { items: LabelledItem[]; className?: string; urls: ImageUrls }) {
  return (
    <ul className={className ?? 'preview-options'}>
      {items.map((item) => (
        <li key={item.id}>
          {item.image && <Picture image={item.image} urls={urls} className="pic-small" />}
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  )
}

function StepBody({ step, urls }: { step: PreviewStep; urls: ImageUrls }) {
  const lead = (
    <>
      <p className="preview-text">{step.prompt ?? step.text}</p>
      {step.image && step.type !== 'media_prompt' && <Picture image={step.image} urls={urls} />}
    </>
  )
  switch (step.type) {
    case 'instruction':
      return lead
    case 'media_prompt':
      return (
        <figure className="preview-media">
          {step.prompt && <p className="preview-text">{step.prompt}</p>}
          {step.image ? (
            <Picture image={step.image} urls={urls} />
          ) : (
            <div className="media-box" role="img" aria-label={step.altText ?? 'Picture without a description'}>
              Picture: {step.altText ?? '(no alt text)'}
            </div>
          )}
          {step.caption && <figcaption>{step.caption}</figcaption>}
        </figure>
      )
    case 'single_choice':
    case 'multi_choice':
      return (
        <>
          {lead}
          <ItemList items={step.options ?? []} className={`preview-options choice-${step.type}`} urls={urls} />
        </>
      )
    case 'numeric_input':
      return (
        <>
          {lead}
          <div className="fake-input">Type a number</div>
        </>
      )
    case 'short_text':
      return (
        <>
          {lead}
          <div className="fake-input">Type your answer{step.maxLen ? ` (up to ${step.maxLen} characters)` : ''}</div>
        </>
      )
    case 'sequence_order':
      return (
        <>
          {lead}
          <ItemList items={step.items ?? []} urls={urls} />
          <p className="preview-note">The child drags these into order.</p>
        </>
      )
    case 'match_pairs':
      return (
        <>
          {lead}
          <div className="pair-columns">
            <ItemList items={step.left ?? []} urls={urls} />
            <ItemList items={step.right ?? []} urls={urls} />
          </div>
        </>
      )
    case 'timer_task':
      return (
        <>
          {lead}
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
          {lead}
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
          {lead}
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
          {lead}
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

export function StepPreview({ definition, images = {} }: { definition: unknown; images?: ImageUrls }) {
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
            <li key={`${step.id}-${i}`} className={step.disabled ? 'preview-step preview-step-off' : 'preview-step'}>
              <p className="preview-step-head">
                <span className="preview-step-type">{STEP_TYPE_LABELS[step.type] ?? step.type}</span>
                <code className="preview-step-id">{step.id}</code>
                {step.disabled && <span className="badge badge-archived">Hidden from children</span>}
              </p>
              <StepBody step={step} urls={images} />
              {step.skills && step.skills.length > 0 && (
                <p className="preview-skills">
                  Skills:{' '}
                  {step.skills.map((code) => (
                    <code key={code} className="answer-chip">
                      {code}
                    </code>
                  ))}
                </p>
              )}
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
