export interface LabelledItem {
  id: string
  label: string
}

export interface PreviewStep {
  id: string
  type: string
  /** Fields the child sees; answer keys are kept separate so the preview can hide them. */
  text?: string
  prompt?: string
  caption?: string
  altText?: string
  hint?: string
  options?: LabelledItem[]
  items?: LabelledItem[]
  left?: LabelledItem[]
  right?: LabelledItem[]
  emojiOptions?: string[]
  checklist?: string[]
  durationSec?: number
  maxSeconds?: number
  maxLen?: number
  optional?: boolean
  skillCode?: string
  ratingOptions?: string[]
  answers: string[]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)
const strList = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined

function labelled(v: unknown): LabelledItem[] | undefined {
  if (!Array.isArray(v)) return undefined
  return v.filter(isObject).map((o) => ({ id: str(o.id) ?? '?', label: str(o.label) ?? '' }))
}

function labelFor(items: LabelledItem[] | undefined, id: string): string {
  return items?.find((i) => i.id === id)?.label ?? id
}

/** Human-readable answer key lines for one step, using labels where the ids can be resolved. */
function answerKey(step: Record<string, unknown>, parsed: Omit<PreviewStep, 'answers'>): string[] {
  switch (parsed.type) {
    case 'single_choice':
    case 'multi_choice':
      return (strList(step.correct) ?? []).map((id) => labelFor(parsed.options, id))
    case 'numeric_input': {
      const answer = num(step.answer)
      const tolerance = num(step.tolerance)
      if (answer === undefined) return []
      return [tolerance ? `${answer} (± ${tolerance})` : String(answer)]
    }
    case 'short_text':
      return strList(step.accepted) ?? []
    case 'sequence_order':
      return (strList(step.correct_order) ?? []).map((id, i) => `${i + 1}. ${labelFor(parsed.items, id)}`)
    case 'match_pairs':
      return (Array.isArray(step.pairs) ? step.pairs : [])
        .filter((p): p is [string, string] => Array.isArray(p) && typeof p[0] === 'string' && typeof p[1] === 'string')
        .map(([l, r]) => `${labelFor(parsed.left, l)} → ${labelFor(parsed.right, r)}`)
    default:
      return []
  }
}

/** Reads the steps of a definition defensively: the editor may hold anything while a person is typing. */
export function previewSteps(definition: unknown): PreviewStep[] {
  if (!isObject(definition) || !Array.isArray(definition.steps)) return []
  return definition.steps.map((raw, index): PreviewStep => {
    if (!isObject(raw)) return { id: `#${index + 1}`, type: 'unreadable', answers: [] }
    const parsed: Omit<PreviewStep, 'answers'> = {
      id: str(raw.id) ?? `#${index + 1}`,
      type: str(raw.type) ?? 'unreadable',
      text: str(raw.text),
      prompt: str(raw.prompt),
      caption: str(raw.caption),
      altText: str(raw.alt_text),
      hint: str(raw.hint),
      options: labelled(raw.options),
      items: labelled(raw.items),
      left: labelled(raw.left),
      right: labelled(raw.right),
      emojiOptions: strList(raw.emoji_options),
      checklist: strList(raw.checklist),
      durationSec: num(raw.duration_sec),
      maxSeconds: num(raw.max_seconds),
      maxLen: num(raw.max_len),
      optional: raw.optional === true,
      skillCode: str(raw.skill_code),
      ratingOptions: strList(raw.rating_options),
    }
    return { ...parsed, answers: answerKey(raw, parsed) }
  })
}

export const STEP_TYPE_LABELS: Record<string, string> = {
  instruction: 'Instruction',
  media_prompt: 'Picture',
  single_choice: 'Pick one',
  multi_choice: 'Pick all that apply',
  numeric_input: 'Number',
  short_text: 'Short answer',
  sequence_order: 'Put in order',
  match_pairs: 'Match pairs',
  timer_task: 'Timed task',
  reflection: 'Reflection',
  audio_record: 'Voice recording',
  photo_evidence: 'Photo',
  parent_checklist: 'Parent checklist',
  unreadable: 'Unreadable step',
}
