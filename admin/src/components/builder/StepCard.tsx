import {
  addSkill,
  changeStepType,
  MAX_HINTS,
  needsSkill,
  removeSkill,
  setHints,
  setSkillWeight,
  STEP_TYPES,
  stepHints,
  stepTypeInfo,
  type Step,
} from '../../domain/builder'
import { useBuilder } from './BuilderContext'
import { ImageField } from './ImageField'
import { SkillPicker } from './SkillPicker'
import { StepBody } from './StepBodies'

export interface StepCardProps {
  step: Step
  index: number
  count: number
  subject: string | undefined
  /** Messages from the last Validate that name this exercise. */
  problems: readonly string[]
  onChange(next: Step): void
  onMove(offset: -1 | 1): void
  onDuplicate(): void
  onRemove(): void
}

const GROUPS = ['Teach', 'Ask', 'Do', 'Reflect'] as const

/** One exercise of the activity as a form. */
export function StepCard({ step, index, count, subject, problems, onChange, onMove, onDuplicate, onRemove }: StepCardProps) {
  const { readOnly } = useBuilder()
  const info = stepTypeInfo(step.type)
  const todo = problems.length === 0 ? stepHints(step) : []
  const hints = step.feedback?.hints ?? []
  const headingId = `step-${step.id}-heading`
  const off = step.enabled === false

  return (
    <section className={off ? 'step-card step-card-off' : 'step-card'} aria-labelledby={headingId} id={`step-${step.id}`}>
      <header className="step-card-head">
        <h3 id={headingId}>
          Exercise {index + 1}: {info?.label ?? step.type}
          <code className="step-id">{step.id}</code>
        </h3>
        {!readOnly && (
          <div className="row-actions">
            <button type="button" className="btn btn-small" disabled={index === 0} onClick={() => onMove(-1)}>
              Move up<span className="visually-hidden"> exercise {index + 1}</span>
            </button>
            <button type="button" className="btn btn-small" disabled={index === count - 1} onClick={() => onMove(1)}>
              Move down<span className="visually-hidden"> exercise {index + 1}</span>
            </button>
            <button type="button" className="btn btn-small" onClick={onDuplicate}>
              Copy<span className="visually-hidden"> exercise {index + 1}</span>
            </button>
            <button type="button" className="btn btn-small btn-danger-outline" disabled={count <= 1} onClick={onRemove}>
              Delete<span className="visually-hidden"> exercise {index + 1}</span>
            </button>
          </div>
        )}
      </header>

      {problems.length > 0 && (
        <div className="panel panel-error" role="alert">
          <p className="panel-title">Fix before submitting</p>
          <ul className="problems">
            {problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <label className="field">
        <span className="field-label">Kind of exercise</span>
        <select value={step.type} disabled={readOnly} onChange={(e) => onChange(changeStepType(step, e.target.value))}>
          {GROUPS.map((group) => (
            <optgroup key={group} label={group}>
              {STEP_TYPES.filter((t) => t.group === group).map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {info && <span className="muted">{info.help}</span>}
      </label>

      <label className="field">
        <span className="field-label">{step.type === 'parent_checklist' ? 'What the parent checks' : 'What the child reads or hears'}</span>
        <textarea
          rows={2}
          maxLength={500}
          value={step.prompt ?? ''}
          disabled={readOnly}
          onChange={(e) => onChange({ ...step, prompt: e.target.value })}
          aria-invalid={problems.length > 0 && (step.prompt ?? '').trim() === '' ? true : undefined}
        />
      </label>

      {step.type !== 'parent_checklist' && (
        <ImageField
          label={`exercise ${index + 1}`}
          value={step.image}
          onChange={(image) => {
            const { image: _old, ...rest } = step
            void _old
            onChange(image ? { ...rest, image } : rest)
          }}
        />
      )}

      <StepBody key={`${step.id}-${step.type}`} step={step} onChange={onChange} />

      <SkillPicker
        stepId={step.id}
        chosen={step.skills ?? []}
        subject={subject}
        required={needsSkill(step)}
        onAdd={(code) => onChange(addSkill(step, code))}
        onRemove={(code) => onChange(removeSkill(step, code))}
        onWeight={(code, weight) => onChange(setSkillWeight(step, code, weight))}
      />

      <fieldset className="hints">
        <legend>Hints (optional, up to {MAX_HINTS})</legend>
        {hints.map((h, i) => (
          <div key={i} className="hint-row">
            <label className="field field-grow">
              <span className="field-label">Hint {i + 1}</span>
              <input
                type="text"
                maxLength={300}
                value={h}
                disabled={readOnly}
                onChange={(e) => onChange(setHints(step, hints.map((x, j) => (j === i ? e.target.value : x))))}
              />
            </label>
            {!readOnly && (
              <button type="button" className="btn btn-small" onClick={() => onChange(setHints(step, hints.filter((_, j) => j !== i)))}>
                Remove<span className="visually-hidden"> hint {i + 1}</span>
              </button>
            )}
          </div>
        ))}
        {!readOnly && hints.length < MAX_HINTS && (
          <button type="button" className="btn btn-small" onClick={() => onChange({ ...step, feedback: { ...step.feedback, hints: [...hints, ''] } })}>
            Add a hint
          </button>
        )}
      </fieldset>

      <label className="check">
        <input
          type="checkbox"
          checked={!off}
          disabled={readOnly}
          onChange={(e) => {
            const { enabled: _old, ...rest } = step
            void _old
            onChange(e.target.checked ? rest : { ...rest, enabled: false })
          }}
        />
        Show this exercise to children
      </label>

      {todo.length > 0 && (
        <ul className="todo" aria-label={`Still to do in exercise ${index + 1}`}>
          {todo.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
