export interface PreviewImage {
  asset: string
  alt: string
}

export interface LabelledItem {
  id: string
  label: string
  image?: PreviewImage
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
  image?: PreviewImage
  /** v2: switched off, so children never see it. */
  disabled?: boolean
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
  /** v2: the skills this exercise gives evidence for. */
  skills?: string[]
  answers: string[]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)
const strList = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined

function image(v: unknown): PreviewImage | undefined {
  if (!isObject(v) || typeof v.asset !== 'string') return undefined
  return { asset: v.asset, alt: str(v.alt) ?? '' }
}

function labelled(v: unknown): LabelledItem[] | undefined {
  if (!Array.isArray(v)) return undefined
  return v.filter(isObject).map((o) => {
    const pic = image(o.image)
    return { id: str(o.id) ?? '?', label: str(o.label) ?? '', ...(pic ? { image: pic } : {}) }
  })
}

function labelFor(items: LabelledItem[] | undefined, id: string): string {
  return items?.find((i) => i.id === id)?.label || id
}

/** v2 documents keep what the child sees in `config` and the answer in `key`; v1 had both flat on the exercise. */
function section(step: Record<string, unknown>, name: 'config' | 'key'): Record<string, unknown> {
  const own = step[name]
  return isObject(own) ? { ...step, ...own } : step
}

/** Human-readable answer key lines for one step, using labels where the ids can be resolved. */
function answerKey(key: Record<string, unknown>, parsed: Omit<PreviewStep, 'answers'>): string[] {
  switch (parsed.type) {
    case 'single_choice':
    case 'multi_choice':
      return (strList(key.correct) ?? []).map((id) => labelFor(parsed.options, id))
    case 'numeric_input': {
      const answer = num(key.answer)
      const tolerance = num(key.tolerance)
      if (answer === undefined) return []
      return [tolerance ? `${answer} (± ${tolerance})` : String(answer)]
    }
    case 'short_text':
      return strList(key.accepted) ?? []
    case 'sequence_order':
      return (strList(key.correct_order) ?? []).map((id, i) => `${i + 1}. ${labelFor(parsed.items, id)}`)
    case 'match_pairs':
      return (Array.isArray(key.pairs) ? key.pairs : [])
        .filter((p): p is [string, string] => Array.isArray(p) && typeof p[0] === 'string' && typeof p[1] === 'string')
        .map(([l, r]) => `${labelFor(parsed.left, l)} → ${labelFor(parsed.right, r)}`)
    default:
      return []
  }
}

function skillCodes(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  return v.filter(isObject).flatMap((s) => (typeof s.code === 'string' ? [s.code] : []))
}

/** Reads the steps of a definition defensively: the editor may hold anything while a person is typing. */
export function previewSteps(definition: unknown): PreviewStep[] {
  if (!isObject(definition) || !Array.isArray(definition.steps)) return []
  return definition.steps.map((raw, index): PreviewStep => {
    if (!isObject(raw)) return { id: `#${index + 1}`, type: 'unreadable', answers: [] }
    const cfg = section(raw, 'config')
    const key = section(raw, 'key')
    const feedback = isObject(raw.feedback) ? raw.feedback : undefined
    const hints = strList(feedback?.hints)
    const parsed: Omit<PreviewStep, 'answers'> = {
      id: str(raw.id) ?? `#${index + 1}`,
      type: str(raw.type) ?? 'unreadable',
      text: str(raw.text),
      prompt: str(raw.prompt),
      caption: str(cfg.caption),
      altText: str(cfg.alt_text),
      hint: str(raw.hint) ?? hints?.[0],
      image: image(raw.image),
      disabled: raw.enabled === false,
      options: labelled(cfg.options),
      items: labelled(cfg.items),
      left: labelled(cfg.left),
      right: labelled(cfg.right),
      emojiOptions: strList(cfg.emoji_options),
      checklist: strList(cfg.checklist),
      durationSec: num(cfg.duration_sec),
      maxSeconds: num(cfg.max_seconds),
      maxLen: num(cfg.max_len),
      optional: cfg.optional === true,
      skillCode: str(raw.skill_code) ?? skillCodes(raw.skills)?.[0],
      ratingOptions: strList(cfg.rating_options),
      skills: skillCodes(raw.skills),
    }
    return { ...parsed, answers: answerKey(key, parsed) }
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
