import { useState } from 'react'
import {
  addChoice,
  addPair,
  choicesOf,
  moveChoice,
  pairInOrder,
  pairRows,
  removeChoice,
  removePair,
  setChoiceImage,
  setChoiceLabel,
  syncKey,
  toggleCorrect,
  type ChoiceListName,
  type Step,
} from '../../domain/builder'
import { useBuilder } from './BuilderContext'
import { ImageField } from './ImageField'

interface BodyProps {
  step: Step
  onChange(next: Step): void
}

function letter(index: number): string {
  return String.fromCharCode(65 + index)
}

// ------------------------------------------------------------------------------------------------ choice lists

interface ChoiceListProps extends BodyProps {
  list: ChoiceListName
  noun: string
  /** Show a "this is correct" control (single and multiple choice). */
  mark?: 'one' | 'many'
  /** The list order is the answer (put in order), so items can be moved. */
  movable?: boolean
  min?: number
  max?: number
}

function ChoiceList({ step, onChange, list, noun, mark, movable, min = 2, max = 8 }: ChoiceListProps) {
  const { readOnly } = useBuilder()
  const items = choicesOf(step, list)
  const correct = new Set(step.key?.correct ?? [])
  return (
    <fieldset className="choice-list">
      <legend>
        {noun}s ({items.length} of {max} at most)
      </legend>
      {movable && <p className="muted">List them in the correct order. The child sees them shuffled.</p>}
      <ol className="choice-rows">
        {items.map((c, i) => (
          <li key={c.id} className="choice-row">
            <div className="choice-main">
              {mark && (
                <label className="check choice-correct">
                  <input
                    type={mark === 'one' ? 'radio' : 'checkbox'}
                    name={`correct-${step.id}`}
                    checked={correct.has(c.id)}
                    disabled={readOnly}
                    onChange={() => onChange(toggleCorrect(step, c.id))}
                  />
                  <span>
                    Correct<span className="visually-hidden"> answer: {noun.toLowerCase()} {letter(i)}</span>
                  </span>
                </label>
              )}
              <label className="field field-grow">
                <span className="field-label">
                  {noun} {movable ? i + 1 : letter(i)}
                </span>
                <input
                  type="text"
                  maxLength={200}
                  value={c.label}
                  disabled={readOnly}
                  onChange={(e) => onChange(setChoiceLabel(step, list, i, e.target.value))}
                />
              </label>
              {!readOnly && (
                <div className="row-actions">
                  {movable && (
                    <>
                      <button
                        type="button"
                        className="btn btn-small"
                        disabled={i === 0}
                        onClick={() => onChange(moveChoice(step, list, i, i - 1))}
                      >
                        Up<span className="visually-hidden"> {noun.toLowerCase()} {i + 1}</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-small"
                        disabled={i === items.length - 1}
                        onClick={() => onChange(moveChoice(step, list, i, i + 1))}
                      >
                        Down<span className="visually-hidden"> {noun.toLowerCase()} {i + 1}</span>
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={items.length <= min}
                    onClick={() => onChange(removeChoice(step, list, i, min))}
                  >
                    Remove<span className="visually-hidden"> {noun.toLowerCase()} {movable ? i + 1 : letter(i)}</span>
                  </button>
                </div>
              )}
            </div>
            <ImageField
              compact
              label={`${noun.toLowerCase()} ${movable ? i + 1 : letter(i)}`}
              value={c.image}
              onChange={(image) => onChange(setChoiceImage(step, list, i, image))}
            />
          </li>
        ))}
      </ol>
      {!readOnly && (
        <button type="button" className="btn btn-small" disabled={items.length >= max} onClick={() => onChange(addChoice(step, list, max))}>
          Add {noun.toLowerCase()}
        </button>
      )}
    </fieldset>
  )
}

export function ChoiceBody({ step, onChange }: BodyProps) {
  const { readOnly } = useBuilder()
  const multi = step.type === 'multi_choice'
  return (
    <>
      <ChoiceList step={step} onChange={onChange} list="options" noun="Choice" mark={multi ? 'many' : 'one'} />
      {multi && (
        <label className="check">
          <input
            type="checkbox"
            checked={step.scoring?.partial_credit === true}
            disabled={readOnly}
            onChange={(e) => onChange({ ...step, scoring: { ...step.scoring, partial_credit: e.target.checked } })}
          />
          Give partial credit when only some correct choices are picked
        </label>
      )}
    </>
  )
}

export function OrderBody({ step, onChange }: BodyProps) {
  return <ChoiceList step={step} onChange={onChange} list="items" noun="Item" movable />
}

// ------------------------------------------------------------------------------------------------ pairs

export function PairsBody({ step, onChange }: BodyProps) {
  const { readOnly } = useBuilder()
  const rows = pairRows(step)
  const lacksPartner = rows.some((r) => !r.right)
  return (
    <fieldset className="choice-list">
      <legend>Pairs ({rows.length} of 8 at most)</legend>
      <p className="muted">Each row is one correct pair: the left item goes with the right item. The child sees both sides shuffled.</p>
      <ol className="choice-rows">
        {rows.map((row, i) => {
          const left = row.left
          const right = row.right
          if (!left) return null
          const rIndex = right ? choicesOf(step, 'right').findIndex((r) => r.id === right.id) : -1
          return (
            <li key={left.id} className="choice-row pair-row">
              <div className="pair-cell">
                <label className="field">
                  <span className="field-label">Left {i + 1}</span>
                  <input
                    type="text"
                    maxLength={200}
                    value={left.label}
                    disabled={readOnly}
                    onChange={(e) => onChange(setChoiceLabel(step, 'left', i, e.target.value))}
                  />
                </label>
                <ImageField
                  compact
                  label={`left item ${i + 1}`}
                  value={left.image}
                  onChange={(image) => onChange(setChoiceImage(step, 'left', i, image))}
                />
              </div>
              <div className="pair-cell">
                {right ? (
                  <>
                    <label className="field">
                      <span className="field-label">Goes with {i + 1}</span>
                      <input
                        type="text"
                        maxLength={200}
                        value={right.label}
                        disabled={readOnly}
                        onChange={(e) => onChange(setChoiceLabel(step, 'right', rIndex, e.target.value))}
                      />
                    </label>
                    <ImageField
                      compact
                      label={`right item ${i + 1}`}
                      value={right.image}
                      onChange={(image) => onChange(setChoiceImage(step, 'right', rIndex, image))}
                    />
                  </>
                ) : (
                  <p className="field-error">This item has no partner. Remove it or rebuild the pairs.</p>
                )}
              </div>
              {!readOnly && (
                <div className="row-actions">
                  <button type="button" className="btn btn-small" disabled={rows.length <= 2} onClick={() => onChange(removePair(step, i))}>
                    Remove<span className="visually-hidden"> pair {i + 1}</span>
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ol>
      {!readOnly && (
        <div className="button-row">
          <button type="button" className="btn btn-small" disabled={rows.length >= 8} onClick={() => onChange(addPair(step))}>
            Add pair
          </button>
          {lacksPartner && (
            <button type="button" className="btn btn-small" onClick={() => onChange(pairInOrder(step))}>
              Pair them in order
            </button>
          )}
        </div>
      )}
    </fieldset>
  )
}

// ------------------------------------------------------------------------------------------------ simple answers

function numberOrUndefined(text: string): number | undefined {
  if (text.trim() === '') return undefined
  const n = Number(text)
  return Number.isFinite(n) ? n : undefined
}

export function NumberBody({ step, onChange }: BodyProps) {
  const { readOnly } = useBuilder()
  const key = step.key ?? {}
  return (
    <div className="field-row">
      <label className="field">
        <span className="field-label">Correct number</span>
        <input
          type="number"
          step="any"
          value={key.answer ?? ''}
          disabled={readOnly}
          onChange={(e) => {
            const answer = numberOrUndefined(e.target.value)
            const { answer: _old, ...rest } = key
            void _old
            onChange({ ...step, key: answer === undefined ? rest : { ...rest, answer } })
          }}
        />
      </label>
      <label className="field">
        <span className="field-label">Allowed difference (±)</span>
        <input
          type="number"
          min={0}
          step="any"
          value={key.tolerance ?? 0}
          disabled={readOnly}
          onChange={(e) => onChange({ ...step, key: { ...key, tolerance: Math.max(0, numberOrUndefined(e.target.value) ?? 0) } })}
        />
      </label>
    </div>
  )
}

function linesOf(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

export function ShortTextBody({ step, onChange }: BodyProps) {
  const { readOnly } = useBuilder()
  const [text, setText] = useState(() => (step.key?.accepted ?? []).join('\n'))
  return (
    <>
      <label className="field">
        <span className="field-label">Accepted answers (one per line)</span>
        <textarea
          rows={3}
          value={text}
          disabled={readOnly}
          onChange={(e) => {
            setText(e.target.value)
            onChange({ ...step, key: { ...step.key, accepted: linesOf(e.target.value) } })
          }}
        />
        <span className="muted">Capital letters do not matter. Leave it empty if there is no single right answer.</span>
      </label>
      <label className="field">
        <span className="field-label">Longest answer (characters)</span>
        <input
          type="number"
          min={1}
          max={500}
          value={step.config?.max_len ?? 60}
          disabled={readOnly}
          onChange={(e) => onChange({ ...step, config: { ...step.config, max_len: Math.min(500, Math.max(1, numberOrUndefined(e.target.value) ?? 60)) } })}
        />
      </label>
    </>
  )
}

// ------------------------------------------------------------------------------------------------ doing things

export function MediaBody({ step, onChange }: BodyProps) {
  const { readOnly } = useBuilder()
  const cfg = step.config ?? {}
  return (
    <>
      <label className="field">
        <span className="field-label">Describe the picture (for screen readers)</span>
        <input
          type="text"
          maxLength={300}
          value={cfg.alt_text ?? ''}
          disabled={readOnly}
          onChange={(e) => onChange({ ...step, config: { ...cfg, alt_text: e.target.value } })}
          aria-invalid={(cfg.alt_text ?? '').trim() === '' ? true : undefined}
        />
      </label>
      <label className="field">
        <span className="field-label">Caption under the picture (optional)</span>
        <input
          type="text"
          maxLength={300}
          value={cfg.caption ?? ''}
          disabled={readOnly}
          onChange={(e) => onChange({ ...step, config: { ...cfg, caption: e.target.value } })}
        />
      </label>
    </>
  )
}

export function TimerBody({ step, onChange }: BodyProps) {
  const { readOnly } = useBuilder()
  const cfg = step.config ?? {}
  const seconds = cfg.duration_sec ?? 0
  const [text, setText] = useState(() => (cfg.checklist ?? []).join('\n'))
  return (
    <>
      <label className="field">
        <span className="field-label">Countdown (seconds)</span>
        <input
          type="number"
          min={5}
          max={7200}
          value={cfg.duration_sec ?? ''}
          disabled={readOnly}
          onChange={(e) => {
            const n = numberOrUndefined(e.target.value)
            const { duration_sec: _old, ...rest } = cfg
            void _old
            onChange({ ...step, config: n === undefined ? rest : { ...rest, duration_sec: Math.round(n) } })
          }}
        />
        {seconds >= 60 && (
          <span className="muted">
            That is {Math.floor(seconds / 60)} min{seconds % 60 ? ` ${seconds % 60} s` : ''}.
          </span>
        )}
      </label>
      <label className="field">
        <span className="field-label">Things to do during the countdown (one per line, optional)</span>
        <textarea
          rows={3}
          value={text}
          disabled={readOnly}
          onChange={(e) => {
            setText(e.target.value)
            onChange({ ...step, config: { ...cfg, checklist: linesOf(e.target.value) } })
          }}
        />
      </label>
    </>
  )
}

export function RecordBody({ step, onChange }: BodyProps) {
  const { readOnly } = useBuilder()
  const cfg = step.config ?? {}
  const audio = step.type === 'audio_record'
  return (
    <>
      {audio && (
        <label className="field">
          <span className="field-label">Longest recording (seconds)</span>
          <input
            type="number"
            min={5}
            max={600}
            value={cfg.max_seconds ?? 30}
            disabled={readOnly}
            onChange={(e) => onChange({ ...step, config: { ...cfg, max_seconds: Math.round(Math.min(600, Math.max(5, numberOrUndefined(e.target.value) ?? 30))) } })}
          />
        </label>
      )}
      {!audio && (
        <label className="check">
          <input
            type="checkbox"
            checked={cfg.optional === true}
            disabled={readOnly}
            onChange={(e) => onChange({ ...step, config: { ...cfg, optional: e.target.checked } })}
          />
          The child may skip taking a photo
        </label>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={cfg.consent_required !== false}
          disabled={readOnly}
          onChange={(e) => onChange({ ...step, config: { ...cfg, consent_required: e.target.checked } })}
        />
        Ask a parent for permission first
      </label>
    </>
  )
}

export function ReflectionBody({ step, onChange }: BodyProps) {
  const { readOnly } = useBuilder()
  const [text, setText] = useState(() => (step.config?.emoji_options ?? []).join(' '))
  return (
    <label className="field">
      <span className="field-label">Emoji choices (2 to 8, separated by spaces)</span>
      <input
        type="text"
        value={text}
        disabled={readOnly}
        onChange={(e) => {
          setText(e.target.value)
          onChange({ ...step, config: { ...step.config, emoji_options: e.target.value.split(/\s+/).filter(Boolean).slice(0, 8) } })
        }}
      />
    </label>
  )
}

const RATINGS = [
  { value: 'trying', label: 'Still trying' },
  { value: 'with_help', label: 'With help' },
  { value: 'independent', label: 'On their own' },
]

export function ParentBody({ step, onChange }: BodyProps) {
  const { readOnly } = useBuilder()
  const chosen = step.config?.rating_options ?? []
  return (
    <fieldset>
      <legend>How a parent can rate it</legend>
      {RATINGS.map((r) => (
        <label key={r.value} className="check">
          <input
            type="checkbox"
            checked={chosen.includes(r.value)}
            disabled={readOnly}
            onChange={(e) => {
              const next = RATINGS.map((x) => x.value).filter((v) => (v === r.value ? e.target.checked : chosen.includes(v)))
              onChange({ ...step, config: { ...step.config, rating_options: next } })
            }}
          />
          {r.label}
        </label>
      ))}
      <p className="muted">This exercise is not shown to the child. The skill below is rated by a parent after the activity.</p>
    </fieldset>
  )
}

/** The part of an exercise form that depends on its type. */
export function StepBody({ step, onChange }: BodyProps) {
  switch (step.type) {
    case 'single_choice':
    case 'multi_choice':
      return <ChoiceBody step={step} onChange={(s) => onChange(syncKey(s))} />
    case 'sequence_order':
      return <OrderBody step={step} onChange={onChange} />
    case 'match_pairs':
      return <PairsBody step={step} onChange={onChange} />
    case 'numeric_input':
      return <NumberBody step={step} onChange={onChange} />
    case 'short_text':
      return <ShortTextBody step={step} onChange={onChange} />
    case 'media_prompt':
      return <MediaBody step={step} onChange={onChange} />
    case 'timer_task':
      return <TimerBody step={step} onChange={onChange} />
    case 'audio_record':
    case 'photo_evidence':
      return <RecordBody step={step} onChange={onChange} />
    case 'reflection':
      return <ReflectionBody step={step} onChange={onChange} />
    case 'parent_checklist':
      return <ParentBody step={step} onChange={onChange} />
    default:
      return null
  }
}
