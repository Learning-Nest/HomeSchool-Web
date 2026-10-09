import { useMemo } from 'react'
import { MAX_SKILLS_PER_STEP, type StepSkill } from '../../domain/builder'
import { useBuilder } from './BuilderContext'

const WEIGHTS = [
  { value: 1, label: 'Fully' },
  { value: 0.75, label: 'Mostly' },
  { value: 0.5, label: 'Partly' },
  { value: 0.25, label: 'A little' },
]

interface Props {
  stepId: string
  chosen: readonly StepSkill[]
  /** The subject of the activity: its skills are listed first. */
  subject: string | undefined
  required: boolean
  onAdd(code: string): void
  onRemove(code: string): void
  onWeight(code: string, weight: number): void
}

/** The skills one exercise gives evidence for, each with how strongly the exercise tests it. */
export function SkillPicker({ stepId, chosen, subject, required, onAdd, onRemove, onWeight }: Props) {
  const { skills, readOnly } = useBuilder()
  const taken = useMemo(() => new Set(chosen.map((s) => s.code)), [chosen])
  const names = useMemo(() => new Map(skills.map((s) => [s.code, s.name])), [skills])

  const groups = useMemo(() => {
    const own = skills.filter((s) => !taken.has(s.code) && s.subject_code === subject)
    const other = skills.filter((s) => !taken.has(s.code) && s.subject_code !== subject)
    return { own, other }
  }, [skills, taken, subject])

  const full = chosen.length >= MAX_SKILLS_PER_STEP
  const selectId = `skill-add-${stepId}`

  return (
    <fieldset className="skills">
      <legend>
        Skills practised{required && <span className="required"> (choose at least one)</span>}
      </legend>
      {chosen.length === 0 ? (
        <p className="muted">{required ? 'No skill chosen yet.' : 'No skills. This exercise will not count as evidence.'}</p>
      ) : (
        <ul className="skill-list">
          {chosen.map((s) => (
            <li key={s.code}>
              <span className="skill-name">
                <code>{s.code}</code> {names.get(s.code) ?? ''}
              </span>
              <label className="field field-inline">
                <span className="visually-hidden">How much {s.code} is tested</span>
                <select
                  value={String(s.weight ?? 1)}
                  disabled={readOnly}
                  onChange={(e) => onWeight(s.code, Number(e.target.value))}
                >
                  {WEIGHTS.map((w) => (
                    <option key={w.value} value={String(w.value)}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </label>
              {!readOnly && (
                <button type="button" className="btn btn-small" onClick={() => onRemove(s.code)}>
                  Remove<span className="visually-hidden"> {s.code}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <label className="field" htmlFor={selectId}>
          <span className="field-label">Add a skill</span>
          <select
            id={selectId}
            value=""
            disabled={full}
            onChange={(e) => {
              if (e.target.value) onAdd(e.target.value)
            }}
          >
            <option value="">{full ? `Up to ${MAX_SKILLS_PER_STEP} skills` : 'Choose a skill…'}</option>
            {groups.own.length > 0 && (
              <optgroup label={subject ? `${subject} skills` : 'Skills'}>
                {groups.own.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.level_code} · {s.name} ({s.code})
                  </option>
                ))}
              </optgroup>
            )}
            {groups.other.length > 0 && (
              <optgroup label="Other subjects">
                {groups.other.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.level_code} · {s.name} ({s.code})
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
      )}
    </fieldset>
  )
}
