/**
 * The model behind the guided activity builder: plain data helpers that turn the v2 activity document into
 * something a form can edit, and back. Nothing here talks to the server; the server stays the authority on
 * what is valid (the Validate button). The hints below only tell a person what is still missing.
 */

export type StepType =
  | 'instruction'
  | 'media_prompt'
  | 'single_choice'
  | 'multi_choice'
  | 'numeric_input'
  | 'short_text'
  | 'sequence_order'
  | 'match_pairs'
  | 'timer_task'
  | 'audio_record'
  | 'photo_evidence'
  | 'reflection'
  | 'parent_checklist'

export interface ImageRef {
  asset: string
  alt: string
}

export interface Choice {
  id: string
  label: string
  image?: ImageRef
}

export interface StepConfig {
  options?: Choice[]
  items?: Choice[]
  left?: Choice[]
  right?: Choice[]
  caption?: string
  alt_text?: string
  max_len?: number
  max_seconds?: number
  consent_required?: boolean
  optional?: boolean
  duration_sec?: number
  checklist?: string[]
  rating_options?: string[]
  emoji_options?: string[]
}

export interface StepKey {
  correct?: string[]
  answer?: number
  tolerance?: number
  accepted?: string[]
  correct_order?: string[]
  pairs?: [string, string][]
}

export interface StepSkill {
  code: string
  weight?: number
}

export interface Step {
  id: string
  type: string
  enabled?: boolean
  title?: string
  prompt?: string
  image?: ImageRef
  config?: StepConfig
  key?: StepKey
  scoring?: { mode?: string; partial_credit?: boolean; points?: number }
  skills?: StepSkill[]
  feedback?: { hints?: string[]; correct?: string; incorrect?: string }
  [extra: string]: unknown
}

export interface Definition {
  schema_version?: number
  slug?: string
  title?: string
  summary?: string
  subject?: string
  level_from?: string
  level_to?: string
  duration_min?: number
  materials?: string[]
  interests?: string[]
  steps: Step[]
  skills?: string[]
  authoring?: { notes?: string }
  [extra: string]: unknown
}

export const MAX_STEPS = 40
export const MAX_SKILLS_PER_STEP = 6
export const MAX_HINTS = 3

export interface StepTypeInfo {
  type: StepType
  label: string
  group: 'Teach' | 'Ask' | 'Do' | 'Reflect'
  help: string
  /** The server scores the answer by itself: needs an answer key and at least one skill. */
  auto: boolean
}

export const STEP_TYPES: readonly StepTypeInfo[] = [
  { type: 'instruction', label: 'Instruction', group: 'Teach', help: 'Text the child reads or hears. No answer.', auto: false },
  { type: 'media_prompt', label: 'Picture', group: 'Teach', help: 'A picture to look at, with a short description for screen readers.', auto: false },
  { type: 'single_choice', label: 'Pick one', group: 'Ask', help: 'The child picks one answer from 2 to 8 choices.', auto: true },
  { type: 'multi_choice', label: 'Pick all that apply', group: 'Ask', help: 'The child picks every correct choice.', auto: true },
  { type: 'numeric_input', label: 'Number', group: 'Ask', help: 'The child types a number.', auto: true },
  { type: 'short_text', label: 'Short answer', group: 'Ask', help: 'The child types a word or two; accepted answers are matched without caring about capital letters.', auto: true },
  { type: 'sequence_order', label: 'Put in order', group: 'Ask', help: 'The child puts items into the right order (you list them in the correct order).', auto: true },
  { type: 'match_pairs', label: 'Match pairs', group: 'Ask', help: 'The child matches each item on the left with one on the right.', auto: true },
  { type: 'timer_task', label: 'Timed task', group: 'Do', help: 'A countdown while the child does something offline.', auto: false },
  { type: 'audio_record', label: 'Voice recording', group: 'Do', help: 'The child records a short answer with a grown-up.', auto: false },
  { type: 'photo_evidence', label: 'Photo', group: 'Do', help: 'The child (with a grown-up) takes a photo of their work.', auto: false },
  { type: 'reflection', label: 'Reflection', group: 'Reflect', help: 'The child picks an emoji for how it went.', auto: false },
  { type: 'parent_checklist', label: 'Parent checklist', group: 'Reflect', help: 'A parent rates how the child did, for one or more skills. Not shown to the child.', auto: false },
]

const TYPE_INFO = new Map<string, StepTypeInfo>(STEP_TYPES.map((t) => [t.type, t]))

export function stepTypeInfo(type: string): StepTypeInfo | undefined {
  return TYPE_INFO.get(type)
}

export function stepTypeLabel(type: string): string {
  return TYPE_INFO.get(type)?.label ?? type
}

/** Types whose answer options can carry pictures. */
export function hasChoiceLists(type: string): boolean {
  return type === 'single_choice' || type === 'multi_choice' || type === 'sequence_order' || type === 'match_pairs'
}

/** An exercise that needs at least one skill: auto-scored ones and parent checklists. */
export function needsSkill(step: Step): boolean {
  if (step.enabled === false) return false
  if (step.type === 'parent_checklist') return true
  if (step.type === 'short_text') return (step.key?.accepted ?? []).length > 0
  return TYPE_INFO.get(step.type)?.auto === true
}

// ------------------------------------------------------------------------------------------------ ids

function nextIndexedId(existing: Iterable<string>, prefix: string): string {
  let highest = 0
  for (const id of existing) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(id)
    if (m) highest = Math.max(highest, Number(m[1]))
  }
  return `${prefix}${highest + 1}`
}

export function nextStepId(steps: readonly Step[]): string {
  return nextIndexedId(
    steps.map((s) => s.id),
    's',
  )
}

const LETTERS = 'abcdefgh'

function letterIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => LETTERS[i] ?? `o${i + 1}`)
}

function nextChoiceId(list: readonly Choice[], prefix: string): string {
  if (prefix === '') {
    const used = new Set(list.map((c) => c.id))
    return LETTERS.split('').find((l) => !used.has(l)) ?? `o${list.length + 1}`
  }
  return nextIndexedId(
    list.map((c) => c.id),
    prefix,
  )
}

function blankChoices(count: number, prefix = ''): Choice[] {
  const ids = prefix === '' ? letterIds(count) : Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`)
  return ids.map((id) => ({ id, label: '' }))
}

// ------------------------------------------------------------------------------------------------ blank steps

export function blankStep(type: string, id: string): Step {
  const base: Step = { id, type, prompt: '' }
  switch (type) {
    case 'instruction':
      return base
    case 'media_prompt':
      return { ...base, config: { alt_text: '', caption: '' } }
    case 'single_choice':
    case 'multi_choice':
      return { ...base, config: { options: blankChoices(3) }, key: { correct: [] } }
    case 'numeric_input':
      return { ...base, key: { tolerance: 0 } }
    case 'short_text':
      return { ...base, config: { max_len: 60 }, key: { accepted: [] } }
    case 'sequence_order': {
      const items = blankChoices(3, 'i')
      return { ...base, config: { items }, key: { correct_order: items.map((i) => i.id) } }
    }
    case 'match_pairs': {
      const left = blankChoices(2, 'l')
      const right = blankChoices(2, 'r')
      return { ...base, config: { left, right }, key: { pairs: left.map((l, i) => [l.id, right[i]!.id] as [string, string]) } }
    }
    case 'timer_task':
      return { ...base, config: { duration_sec: 60, checklist: [] } }
    case 'audio_record':
      return { ...base, config: { max_seconds: 30, consent_required: true } }
    case 'photo_evidence':
      return { ...base, config: { optional: true, consent_required: true } }
    case 'reflection':
      return { ...base, config: { emoji_options: ['😀', '🙂', '😐', '🙁'] } }
    case 'parent_checklist':
      return { ...base, config: { rating_options: ['trying', 'with_help', 'independent'] } }
    default:
      return base
  }
}

/** The document a new activity starts from: the basics plus the chosen number of exercises. */
export function newDefinition(input: {
  title: string
  subject: string
  levelFrom: string
  levelTo: string
  durationMin: number
  exerciseCount: number
  firstType?: string
}): Definition {
  const count = Math.min(MAX_STEPS, Math.max(1, Math.round(input.exerciseCount)))
  const steps: Step[] = []
  for (let i = 0; i < count; i++) steps.push(blankStep(input.firstType ?? 'single_choice', nextStepId(steps)))
  return {
    schema_version: 2,
    title: input.title.trim(),
    subject: input.subject,
    level_from: input.levelFrom,
    level_to: input.levelTo,
    duration_min: input.durationMin,
    steps,
  }
}

// ------------------------------------------------------------------------------------------------ editing steps

/** Is anything typed or chosen in this exercise? Used to ask before throwing work away. */
export function stepHasContent(step: Step): boolean {
  if ((step.prompt ?? '').trim() || step.image || (step.skills ?? []).length) return true
  const cfg = step.config ?? {}
  for (const list of [cfg.options, cfg.items, cfg.left, cfg.right]) {
    if (list?.some((c) => c.label.trim() || c.image)) return true
  }
  if ((cfg.alt_text ?? '').trim() || (cfg.caption ?? '').trim()) return true
  const key = step.key ?? {}
  return key.answer !== undefined || (key.accepted ?? []).length > 0
}

export function replaceStep(def: Definition, index: number, step: Step): Definition {
  return { ...def, steps: def.steps.map((s, i) => (i === index ? step : s)) }
}

export function addStep(def: Definition, type: string, at?: number): Definition {
  if (def.steps.length >= MAX_STEPS) return def
  const step = blankStep(type, nextStepId(def.steps))
  const steps = [...def.steps]
  steps.splice(at ?? steps.length, 0, step)
  return { ...def, steps }
}

export function removeStep(def: Definition, index: number): Definition {
  return { ...def, steps: def.steps.filter((_, i) => i !== index) }
}

export function moveStep(def: Definition, from: number, to: number): Definition {
  if (to < 0 || to >= def.steps.length || from === to) return def
  const steps = [...def.steps]
  const [moved] = steps.splice(from, 1)
  if (!moved) return def
  steps.splice(to, 0, moved)
  return { ...def, steps }
}

export function duplicateStep(def: Definition, index: number): Definition {
  const source = def.steps[index]
  if (!source || def.steps.length >= MAX_STEPS) return def
  const copy: Step = { ...(JSON.parse(JSON.stringify(source)) as Step), id: nextStepId(def.steps) }
  const steps = [...def.steps]
  steps.splice(index + 1, 0, copy)
  return { ...def, steps }
}

/** Grows the activity with blank exercises of `type`, or cuts it down from the end. */
export function resizeSteps(def: Definition, count: number, type = 'single_choice'): Definition {
  const target = Math.min(MAX_STEPS, Math.max(1, Math.round(count)))
  if (target === def.steps.length) return def
  if (target < def.steps.length) return { ...def, steps: def.steps.slice(0, target) }
  let next = def
  while (next.steps.length < target) next = addStep(next, type)
  return next
}

/** How many exercises a smaller size would delete, and how many of those already have content. */
export function removalImpact(def: Definition, count: number): { removed: number; withContent: number } {
  const removed = def.steps.slice(Math.max(0, count))
  return { removed: removed.length, withContent: removed.filter(stepHasContent).length }
}

function isChoiceType(type: string): boolean {
  return type === 'single_choice' || type === 'multi_choice'
}

/** Switches the kind of exercise and keeps what still applies (text, picture, skills, hints, shared choices). */
export function changeStepType(step: Step, type: string): Step {
  if (step.type === type) return step
  const fresh = blankStep(type, step.id)
  const next: Step = { ...fresh }
  if (step.enabled !== undefined) next.enabled = step.enabled
  if (step.title !== undefined) next.title = step.title
  if (step.image !== undefined) next.image = step.image
  if (step.skills !== undefined) next.skills = step.skills
  if (step.feedback !== undefined) next.feedback = step.feedback
  next.prompt = step.prompt ?? ''
  if (isChoiceType(step.type) && isChoiceType(type) && step.config?.options) {
    const correct = step.key?.correct ?? []
    next.config = { options: step.config.options }
    next.key = { correct: type === 'single_choice' ? correct.slice(0, 1) : correct }
  }
  if (step.scoring?.mode && fresh.scoring === undefined) {
    // An explicit scoring choice made for the old type may not exist for the new one; the server default applies.
    delete next.scoring
  }
  return next
}

// ------------------------------------------------------------------------------------------------ choice lists

export type ChoiceListName = 'options' | 'items' | 'left' | 'right'

export function choicesOf(step: Step, list: ChoiceListName): Choice[] {
  return step.config?.[list] ?? []
}

function withChoices(step: Step, list: ChoiceListName, choices: Choice[]): Step {
  return { ...step, config: { ...step.config, [list]: choices } }
}

/**
 * Keeps the answer key in line with the lists after an add, remove or move: choices that no longer exist are dropped
 * from `correct`, a sequence's correct order is the list order, and a pair that lost a side disappears.
 */
export function syncKey(step: Step): Step {
  const key = { ...step.key }
  if (isChoiceType(step.type)) {
    const ids = new Set(choicesOf(step, 'options').map((c) => c.id))
    key.correct = (key.correct ?? []).filter((id) => ids.has(id))
  } else if (step.type === 'sequence_order') {
    key.correct_order = choicesOf(step, 'items').map((c) => c.id)
  } else if (step.type === 'match_pairs') {
    const left = new Set(choicesOf(step, 'left').map((c) => c.id))
    const right = new Set(choicesOf(step, 'right').map((c) => c.id))
    key.pairs = (key.pairs ?? []).filter(([l, r]) => left.has(l) && right.has(r))
  } else {
    return step
  }
  return { ...step, key }
}

const LIST_PREFIX: Record<ChoiceListName, string> = { options: '', items: 'i', left: 'l', right: 'r' }

export function setChoiceLabel(step: Step, list: ChoiceListName, index: number, label: string): Step {
  return withChoices(
    step,
    list,
    choicesOf(step, list).map((c, i) => (i === index ? { ...c, label } : c)),
  )
}

export function setChoiceImage(step: Step, list: ChoiceListName, index: number, image: ImageRef | undefined): Step {
  return withChoices(
    step,
    list,
    choicesOf(step, list).map((c, i) => {
      if (i !== index) return c
      const { image: _old, ...rest } = c
      void _old
      return image ? { ...rest, image } : rest
    }),
  )
}

export function addChoice(step: Step, list: ChoiceListName, max = 8): Step {
  const current = choicesOf(step, list)
  if (current.length >= max) return step
  const added = { id: nextChoiceId(current, LIST_PREFIX[list]), label: '' }
  const next = withChoices(step, list, [...current, added])
  if (step.type === 'match_pairs') return next // a new pair is completed by choosing its partner
  return syncKey(next)
}

export function removeChoice(step: Step, list: ChoiceListName, index: number, min = 2): Step {
  const current = choicesOf(step, list)
  if (current.length <= min) return step
  return syncKey(
    withChoices(
      step,
      list,
      current.filter((_, i) => i !== index),
    ),
  )
}

export function moveChoice(step: Step, list: ChoiceListName, from: number, to: number): Step {
  const current = [...choicesOf(step, list)]
  if (to < 0 || to >= current.length || from === to) return step
  const [moved] = current.splice(from, 1)
  if (!moved) return step
  current.splice(to, 0, moved)
  return syncKey(withChoices(step, list, current))
}

/** Marks or unmarks a choice as correct (single choice allows exactly one). */
export function toggleCorrect(step: Step, optionId: string): Step {
  const correct = step.key?.correct ?? []
  let next: string[]
  if (step.type === 'single_choice') next = [optionId]
  else next = correct.includes(optionId) ? correct.filter((id) => id !== optionId) : [...correct, optionId]
  return { ...step, key: { ...step.key, correct: next } }
}

// ------------------------------------------------------------------------------------------------ pairs

/** The match-pairs table as rows: each row is one correct pair (left item, right item). */
export function pairRows(step: Step): { left: Choice | undefined; right: Choice | undefined }[] {
  const left = choicesOf(step, 'left')
  const right = choicesOf(step, 'right')
  const byLeft = new Map((step.key?.pairs ?? []).map(([l, r]) => [l, r]))
  return left.map((l) => ({ left: l, right: right.find((r) => r.id === byLeft.get(l.id)) }))
}

/** Rebuilds `pairs` so that the i-th left item belongs with the i-th right item. */
export function pairInOrder(step: Step): Step {
  const left = choicesOf(step, 'left')
  const right = choicesOf(step, 'right')
  const n = Math.min(left.length, right.length)
  const pairs: [string, string][] = []
  for (let i = 0; i < n; i++) pairs.push([left[i]!.id, right[i]!.id])
  return { ...step, key: { ...step.key, pairs } }
}

/** Adds one more correct pair (a new left and a new right item, matched with each other). */
export function addPair(step: Step, max = 8): Step {
  const left = choicesOf(step, 'left')
  const right = choicesOf(step, 'right')
  if (left.length >= max) return step
  const l = { id: nextChoiceId(left, 'l'), label: '' }
  const r = { id: nextChoiceId(right, 'r'), label: '' }
  return {
    ...step,
    config: { ...step.config, left: [...left, l], right: [...right, r] },
    key: { ...step.key, pairs: [...(step.key?.pairs ?? []), [l.id, r.id]] },
  }
}

export function removePair(step: Step, rowIndex: number, min = 2): Step {
  const left = choicesOf(step, 'left')
  const target = left[rowIndex]
  if (!target || left.length <= min) return step
  const partner = (step.key?.pairs ?? []).find(([l]) => l === target.id)?.[1]
  return syncKey({
    ...step,
    config: {
      ...step.config,
      left: left.filter((_, i) => i !== rowIndex),
      right: choicesOf(step, 'right').filter((r) => r.id !== partner),
    },
  })
}

// ------------------------------------------------------------------------------------------------ skills & hints

export function addSkill(step: Step, code: string): Step {
  const skills = step.skills ?? []
  if (skills.length >= MAX_SKILLS_PER_STEP || skills.some((s) => s.code === code)) return step
  return { ...step, skills: [...skills, { code, weight: 1 }] }
}

export function removeSkill(step: Step, code: string): Step {
  return { ...step, skills: (step.skills ?? []).filter((s) => s.code !== code) }
}

export function setSkillWeight(step: Step, code: string, weight: number): Step {
  return { ...step, skills: (step.skills ?? []).map((s) => (s.code === code ? { ...s, weight } : s)) }
}

export function setHints(step: Step, hints: string[]): Step {
  const clean = hints.slice(0, MAX_HINTS)
  const { hints: _old, ...otherFeedback } = step.feedback ?? {}
  void _old
  const feedback = clean.length > 0 ? { ...otherFeedback, hints: clean } : otherFeedback
  const { feedback: _feedback, ...rest } = step
  void _feedback
  return Object.keys(feedback).length > 0 ? { ...rest, feedback } : rest
}

// ------------------------------------------------------------------------------------------------ hints for authors

/** Things still missing in one exercise, in plain words. The server's Validate is the real check. */
export function stepHints(step: Step): string[] {
  if (step.enabled === false) return []
  const out: string[] = []
  const cfg = step.config ?? {}
  const key = step.key ?? {}
  if (!(step.prompt ?? '').trim()) out.push('Write what the child reads or hears.')
  const labelsMissing = (list: Choice[] | undefined) => (list ?? []).some((c) => !c.label.trim())
  switch (step.type) {
    case 'media_prompt':
      if (!(cfg.alt_text ?? '').trim()) out.push('Describe the picture in a few words (for screen readers).')
      if (!step.image) out.push('Add the picture.')
      break
    case 'single_choice':
    case 'multi_choice':
      if (labelsMissing(cfg.options)) out.push('Fill in the text of every choice.')
      if ((key.correct ?? []).length === 0) out.push('Mark the correct answer.')
      break
    case 'numeric_input':
      if (key.answer === undefined || Number.isNaN(key.answer)) out.push('Enter the correct number.')
      break
    case 'short_text':
      if ((key.accepted ?? []).length === 0) out.push('List at least one accepted answer, or leave it unscored.')
      break
    case 'sequence_order':
      if (labelsMissing(cfg.items)) out.push('Fill in the text of every item.')
      break
    case 'match_pairs':
      if (labelsMissing(cfg.left) || labelsMissing(cfg.right)) out.push('Fill in both sides of every pair.')
      break
    case 'timer_task':
      if (!cfg.duration_sec) out.push('Set how long the countdown runs.')
      break
    default:
      break
  }
  for (const c of [...(cfg.options ?? []), ...(cfg.items ?? []), ...(cfg.left ?? []), ...(cfg.right ?? [])]) {
    if (c.image && !c.image.alt.trim()) {
      out.push('Describe every picture in a few words.')
      break
    }
  }
  if (step.image && !step.image.alt.trim() && step.type !== 'media_prompt') out.push('Describe the picture in a few words.')
  if (needsSkill(step) && (step.skills ?? []).length === 0) out.push('Choose the skill this exercise practises.')
  return out
}

/** Exercises that count towards the activity's skills, for the summary line. */
export function skillCodes(def: Definition): string[] {
  const codes = new Set<string>()
  for (const step of def.steps) {
    if (step.enabled === false) continue
    for (const s of step.skills ?? []) codes.add(s.code)
  }
  return [...codes].sort()
}

/** Every picture the definition points at (steps, choices), in document order. */
export function imageRefs(def: Definition): ImageRef[] {
  const refs: ImageRef[] = []
  for (const step of def.steps) {
    if (step.image) refs.push(step.image)
    for (const list of [step.config?.options, step.config?.items, step.config?.left, step.config?.right]) {
      for (const c of list ?? []) if (c.image) refs.push(c.image)
    }
  }
  return refs
}

export function usedAssetIds(def: Definition): Set<string> {
  return new Set(imageRefs(def).map((r) => r.asset))
}

// ------------------------------------------------------------------------------------------------ loading

export function isBuildable(raw: Record<string, unknown>): raw is Definition {
  if (raw.schema_version !== 2 || !Array.isArray(raw.steps)) return false
  return raw.steps.every(
    (s) => typeof s === 'object' && s !== null && typeof (s as Step).id === 'string' && typeof (s as Step).type === 'string',
  )
}

export function toDefinition(raw: Record<string, unknown>): Definition | null {
  return isBuildable(raw) ? raw : null
}

/** A stable text form for "has anything changed" comparisons. */
export function fingerprint(def: Definition): string {
  return JSON.stringify(def)
}
