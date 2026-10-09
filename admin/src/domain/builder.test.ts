import { describe, expect, it } from 'vitest'
import {
  addChoice,
  addPair,
  addSkill,
  addStep,
  blankStep,
  changeStepType,
  choicesOf,
  duplicateStep,
  imageRefs,
  isBuildable,
  MAX_STEPS,
  moveChoice,
  moveStep,
  needsSkill,
  newDefinition,
  nextStepId,
  pairRows,
  removeChoice,
  removePair,
  removeSkill,
  removalImpact,
  removeStep,
  resizeSteps,
  setChoiceImage,
  setChoiceLabel,
  setHints,
  setSkillWeight,
  skillCodes,
  stepHasContent,
  stepHints,
  STEP_TYPES,
  syncKey,
  toggleCorrect,
  usedAssetIds,
  type Definition,
  type Step,
} from './builder'

const base = () =>
  newDefinition({ title: ' Socks ', subject: 'MAT', levelFrom: 'L1', levelTo: 'L2', durationMin: 10, exerciseCount: 3 })

describe('new activities', () => {
  it('starts from the basics with the chosen number of blank exercises', () => {
    const def = base()
    expect(def).toMatchObject({ schema_version: 2, title: 'Socks', subject: 'MAT', level_from: 'L1', level_to: 'L2', duration_min: 10 })
    expect(def.steps.map((s) => s.id)).toEqual(['s1', 's2', 's3'])
    expect(def.steps.every((s) => s.type === 'single_choice')).toBe(true)
  })

  it('keeps the number of exercises between 1 and the maximum', () => {
    expect(newDefinition({ title: 'x', subject: 'MAT', levelFrom: 'L1', levelTo: 'L1', durationMin: 5, exerciseCount: 0 }).steps).toHaveLength(1)
    expect(newDefinition({ title: 'x', subject: 'MAT', levelFrom: 'L1', levelTo: 'L1', durationMin: 5, exerciseCount: 500 }).steps).toHaveLength(MAX_STEPS)
  })

  it('has a blank form for every kind of exercise that the editor can switch to', () => {
    for (const info of STEP_TYPES) {
      const step = blankStep(info.type, 's1')
      expect(step).toMatchObject({ id: 's1', type: info.type })
    }
    expect(STEP_TYPES).toHaveLength(13)
  })
})

describe('adding, removing and moving exercises', () => {
  it('never reuses an id, even after the last exercise was deleted', () => {
    let def = base()
    def = removeStep(def, 2)
    def = addStep(def, 'instruction')
    expect(def.steps.map((s) => s.id)).toEqual(['s1', 's2', 's3'])
    def = removeStep(def, 0)
    def = addStep(def, 'instruction')
    expect(def.steps.map((s) => s.id)).toEqual(['s2', 's3', 's4'])
    expect(nextStepId(def.steps)).toBe('s5')
  })

  it('moves and copies exercises', () => {
    const def = base()
    expect(moveStep(def, 0, 2).steps.map((s) => s.id)).toEqual(['s2', 's3', 's1'])
    expect(moveStep(def, 0, -1)).toBe(def)
    const copy = duplicateStep(def, 0)
    expect(copy.steps.map((s) => s.id)).toEqual(['s1', 's4', 's2', 's3'])
    expect(copy.steps[1]).not.toBe(copy.steps[0])
  })

  it('stops at the maximum number of exercises', () => {
    const full = resizeSteps(base(), MAX_STEPS)
    expect(full.steps).toHaveLength(MAX_STEPS)
    expect(addStep(full, 'instruction')).toBe(full)
    expect(duplicateStep(full, 0)).toBe(full)
  })

  it('resizes: grows with blanks and shrinks from the end', () => {
    const grown = resizeSteps(base(), 5, 'instruction')
    expect(grown.steps.map((s) => s.type)).toEqual(['single_choice', 'single_choice', 'single_choice', 'instruction', 'instruction'])
    expect(resizeSteps(grown, 2).steps.map((s) => s.id)).toEqual(['s1', 's2'])
    expect(resizeSteps(grown, 0).steps).toHaveLength(1)
  })

  it('tells how much work a smaller size would throw away', () => {
    let def = base()
    def = { ...def, steps: def.steps.map((s, i) => (i === 2 ? { ...s, prompt: 'Count the socks' } : s)) }
    expect(removalImpact(def, 3)).toEqual({ removed: 0, withContent: 0 })
    expect(removalImpact(def, 2)).toEqual({ removed: 1, withContent: 1 })
    expect(removalImpact(def, 1)).toEqual({ removed: 2, withContent: 1 })
  })

  it('knows when an exercise has content', () => {
    expect(stepHasContent(blankStep('single_choice', 's1'))).toBe(false)
    expect(stepHasContent({ ...blankStep('single_choice', 's1'), prompt: 'x' })).toBe(true)
    expect(stepHasContent(addSkill(blankStep('numeric_input', 's1'), 'MAT.NUM.ADD10'))).toBe(true)
    expect(stepHasContent(setChoiceLabel(blankStep('single_choice', 's1'), 'options', 0, 'Two'))).toBe(true)
  })
})

describe('changing the kind of exercise', () => {
  it('keeps the text, picture, skills and hints', () => {
    let step: Step = { ...blankStep('instruction', 's1'), prompt: 'Look', image: { asset: 'a1', alt: 'A sock' } }
    step = addSkill(step, 'MAT.NUM.COUNT20')
    step = setHints(step, ['Count slowly'])
    const next = changeStepType(step, 'numeric_input')
    expect(next).toMatchObject({ id: 's1', type: 'numeric_input', prompt: 'Look', image: { asset: 'a1' } })
    expect(next.skills).toEqual([{ code: 'MAT.NUM.COUNT20', weight: 1 }])
    expect(next.feedback?.hints).toEqual(['Count slowly'])
  })

  it('keeps the choices when switching between pick-one and pick-many', () => {
    let step = blankStep('multi_choice', 's1')
    step = setChoiceLabel(setChoiceLabel(step, 'options', 0, 'Red'), 'options', 1, 'Blue')
    step = toggleCorrect(toggleCorrect(step, 'a'), 'b')
    const one = changeStepType(step, 'single_choice')
    expect(choicesOf(one, 'options').map((c) => c.label)).toEqual(['Red', 'Blue', ''])
    expect(one.key?.correct).toEqual(['a'])
    expect(changeStepType(one, 'multi_choice').key?.correct).toEqual(['a'])
  })

  it('starts the new kind fresh when nothing carries over', () => {
    const next = changeStepType(setChoiceLabel(blankStep('single_choice', 's1'), 'options', 0, 'x'), 'match_pairs')
    expect(next.config?.options).toBeUndefined()
    expect(choicesOf(next, 'left')).toHaveLength(2)
  })

  it('does nothing when the kind is the same', () => {
    const step = blankStep('short_text', 's1')
    expect(changeStepType(step, 'short_text')).toBe(step)
  })
})

describe('choices and the answer key', () => {
  it('lets single choice have one right answer and multiple choice many', () => {
    const one = toggleCorrect(toggleCorrect(blankStep('single_choice', 's1'), 'a'), 'b')
    expect(one.key?.correct).toEqual(['b'])
    let many = blankStep('multi_choice', 's1')
    many = toggleCorrect(toggleCorrect(many, 'a'), 'c')
    expect(many.key?.correct).toEqual(['a', 'c'])
    expect(toggleCorrect(many, 'a').key?.correct).toEqual(['c'])
  })

  it('drops a removed choice from the correct answers and refuses to go below two', () => {
    let step = toggleCorrect(blankStep('single_choice', 's1'), 'c')
    step = removeChoice(step, 'options', 2)
    expect(choicesOf(step, 'options').map((c) => c.id)).toEqual(['a', 'b'])
    expect(step.key?.correct).toEqual([])
    expect(removeChoice(step, 'options', 0)).toBe(step)
  })

  it('adds choices with unused letters up to eight', () => {
    let step = removeChoice(blankStep('single_choice', 's1'), 'options', 0)
    step = addChoice(step, 'options')
    expect(choicesOf(step, 'options').map((c) => c.id)).toEqual(['b', 'c', 'a'])
    for (let i = 0; i < 10; i++) step = addChoice(step, 'options')
    expect(choicesOf(step, 'options')).toHaveLength(8)
  })

  it('keeps the correct order equal to the order of the items', () => {
    let step = blankStep('sequence_order', 's1')
    expect(step.key?.correct_order).toEqual(['i1', 'i2', 'i3'])
    step = moveChoice(step, 'items', 2, 0)
    expect(step.key?.correct_order).toEqual(['i3', 'i1', 'i2'])
    step = addChoice(step, 'items')
    expect(step.key?.correct_order).toEqual(['i3', 'i1', 'i2', 'i4'])
    step = removeChoice(step, 'items', 0)
    expect(step.key?.correct_order).toEqual(['i1', 'i2', 'i4'])
  })

  it('attaches and removes a picture on a choice', () => {
    let step = setChoiceImage(blankStep('single_choice', 's1'), 'options', 1, { asset: 'x', alt: 'Cat' })
    expect(choicesOf(step, 'options')[1]?.image).toEqual({ asset: 'x', alt: 'Cat' })
    step = setChoiceImage(step, 'options', 1, undefined)
    expect(choicesOf(step, 'options')[1]).toEqual({ id: 'b', label: '' })
  })

  it('syncKey ignores kinds that have no list-based key', () => {
    const step = blankStep('numeric_input', 's1')
    expect(syncKey(step)).toBe(step)
  })
})

describe('pairs', () => {
  it('shows each left item next to its partner', () => {
    let step = blankStep('match_pairs', 's1')
    step = setChoiceLabel(step, 'left', 0, 'Dog')
    step = setChoiceLabel(step, 'right', 0, 'Bark')
    const rows = pairRows(step)
    expect(rows[0]?.left?.label).toBe('Dog')
    expect(rows[0]?.right?.label).toBe('Bark')
    expect(rows).toHaveLength(2)
  })

  it('adds a complete pair and removes one together with its partner', () => {
    let step = addPair(blankStep('match_pairs', 's1'))
    expect(step.key?.pairs).toEqual([
      ['l1', 'r1'],
      ['l2', 'r2'],
      ['l3', 'r3'],
    ])
    step = removePair(step, 0)
    expect(choicesOf(step, 'left').map((c) => c.id)).toEqual(['l2', 'l3'])
    expect(choicesOf(step, 'right').map((c) => c.id)).toEqual(['r2', 'r3'])
    expect(step.key?.pairs).toEqual([
      ['l2', 'r2'],
      ['l3', 'r3'],
    ])
    expect(removePair(step, 0)).toBe(step)
  })
})

describe('skills and hints', () => {
  it('adds a skill once, with full weight, up to six', () => {
    let step = blankStep('numeric_input', 's1')
    step = addSkill(addSkill(step, 'MAT.NUM.ADD10'), 'MAT.NUM.ADD10')
    expect(step.skills).toEqual([{ code: 'MAT.NUM.ADD10', weight: 1 }])
    for (const code of ['MAT.A.B', 'MAT.A.C', 'MAT.A.D', 'MAT.A.E', 'MAT.A.F', 'MAT.A.G']) step = addSkill(step, code)
    expect(step.skills).toHaveLength(6)
  })

  it('changes a weight and removes a skill', () => {
    let step = addSkill(blankStep('numeric_input', 's1'), 'MAT.NUM.ADD10')
    step = setSkillWeight(step, 'MAT.NUM.ADD10', 0.5)
    expect(step.skills?.[0]?.weight).toBe(0.5)
    expect(removeSkill(step, 'MAT.NUM.ADD10').skills).toEqual([])
  })

  it('stores up to three hints and leaves no empty feedback behind', () => {
    let step = setHints(blankStep('numeric_input', 's1'), ['a', 'b', 'c', 'd'])
    expect(step.feedback?.hints).toEqual(['a', 'b', 'c'])
    step = setHints(step, [])
    expect(step.feedback).toBeUndefined()
  })

  it('knows which exercises need a skill', () => {
    expect(needsSkill(blankStep('single_choice', 's1'))).toBe(true)
    expect(needsSkill(blankStep('parent_checklist', 's1'))).toBe(true)
    expect(needsSkill(blankStep('instruction', 's1'))).toBe(false)
    expect(needsSkill(blankStep('short_text', 's1'))).toBe(false)
    expect(needsSkill({ ...blankStep('short_text', 's1'), key: { accepted: ['cat'] } })).toBe(true)
    expect(needsSkill({ ...blankStep('single_choice', 's1'), enabled: false })).toBe(false)
  })

  it('lists the skills of the enabled exercises once each', () => {
    let def: Definition = base()
    def = { ...def, steps: def.steps.map((s) => addSkill(s, 'MAT.NUM.ADD10')) }
    def = { ...def, steps: def.steps.map((s, i) => (i === 0 ? addSkill(s, 'MAT.NUM.COUNT20') : i === 1 ? { ...s, enabled: false } : s)) }
    expect(skillCodes(def)).toEqual(['MAT.NUM.ADD10', 'MAT.NUM.COUNT20'])
  })
})

describe('what is still missing', () => {
  it('asks for the prompt, the choices, the answer and a skill', () => {
    const hints = stepHints(blankStep('single_choice', 's1'))
    expect(hints).toContain('Write what the child reads or hears.')
    expect(hints).toContain('Fill in the text of every choice.')
    expect(hints).toContain('Mark the correct answer.')
    expect(hints).toContain('Choose the skill this exercise practises.')
  })

  it('is satisfied by a complete exercise', () => {
    let step = blankStep('single_choice', 's1')
    step = { ...step, prompt: 'How many?' }
    step = setChoiceLabel(setChoiceLabel(setChoiceLabel(step, 'options', 0, '1'), 'options', 1, '2'), 'options', 2, '3')
    step = addSkill(toggleCorrect(step, 'b'), 'MAT.NUM.COUNT20')
    expect(stepHints(step)).toEqual([])
  })

  it('wants a description for every picture', () => {
    const step = {
      ...blankStep('instruction', 's1'),
      prompt: 'Look',
      image: { asset: 'a', alt: '  ' },
    }
    expect(stepHints(step)).toContain('Describe the picture in a few words.')
  })

  it('says nothing about a hidden exercise', () => {
    expect(stepHints({ ...blankStep('single_choice', 's1'), enabled: false })).toEqual([])
  })

  it('checks numbers and countdowns', () => {
    expect(stepHints(blankStep('numeric_input', 's1'))).toContain('Enter the correct number.')
    expect(stepHints({ ...blankStep('timer_task', 's1'), config: {} })).toContain('Set how long the countdown runs.')
  })
})

describe('pictures', () => {
  it('collects every picture the definition points at', () => {
    let def = base()
    const first = setChoiceImage(blankStep('single_choice', 's1'), 'options', 0, { asset: 'p2', alt: 'Two' })
    def = { ...def, steps: [{ ...first, image: { asset: 'p1', alt: 'One' } }, ...def.steps.slice(1)] }
    expect(imageRefs(def).map((r) => r.asset)).toEqual(['p1', 'p2'])
    expect([...usedAssetIds(def)].sort()).toEqual(['p1', 'p2'])
  })
})

describe('loading', () => {
  it('only edits version 2 documents', () => {
    expect(isBuildable({ schema_version: 2, steps: [{ id: 's1', type: 'instruction' }] })).toBe(true)
    expect(isBuildable({ steps: [{ id: 's1', type: 'instruction' }] })).toBe(false)
    expect(isBuildable({ schema_version: 2, steps: [{ type: 'instruction' }] })).toBe(false)
    expect(isBuildable({ schema_version: 2 })).toBe(false)
  })
})
