import { describe, expect, it } from 'vitest'
import { previewSteps } from './steps'

describe('previewSteps', () => {
  it('reads the v2 layout: config, key, step image, first hint and skills', () => {
    const [step] = previewSteps({
      steps: [
        {
          id: 's1',
          type: 'single_choice',
          prompt: 'Which is a circle?',
          image: { asset: 'img1', alt: 'Shapes' },
          config: {
            options: [
              { id: 'a', label: 'Ball', image: { asset: 'img2', alt: 'A ball' } },
              { id: 'b', label: 'Box' },
            ],
          },
          key: { correct: ['a'] },
          feedback: { hints: ['Think about corners', 'Second'] },
          skills: [{ code: 'MAT.SHAPES', weight: 1 }],
        },
      ],
    })
    expect(step?.prompt).toBe('Which is a circle?')
    expect(step?.image).toEqual({ asset: 'img1', alt: 'Shapes' })
    expect(step?.options?.[0]?.image).toEqual({ asset: 'img2', alt: 'A ball' })
    expect(step?.options?.[1]?.image).toBeUndefined()
    expect(step?.answers).toEqual(['Ball'])
    expect(step?.hint).toBe('Think about corners')
    expect(step?.skills).toEqual(['MAT.SHAPES'])
    expect(step?.skillCode).toBe('MAT.SHAPES')
    expect(step?.disabled).toBe(false)
  })

  it('still reads the older flat layout', () => {
    const [step] = previewSteps({
      steps: [{ id: 's1', type: 'numeric_input', prompt: '2 + 2', answer: 4, tolerance: 1, hint: 'Count fingers' }],
    })
    expect(step?.answers).toEqual(['4 (± 1)'])
    expect(step?.hint).toBe('Count fingers')
  })

  it('marks a switched-off exercise and resolves match and order answers to labels', () => {
    const steps = previewSteps({
      steps: [
        {
          id: 'm',
          type: 'match_pairs',
          enabled: false,
          config: { left: [{ id: 'l1', label: 'Cat' }], right: [{ id: 'r1', label: 'Meow' }] },
          key: { pairs: [['l1', 'r1']] },
        },
        {
          id: 'o',
          type: 'sequence_order',
          config: { items: [{ id: 'i1', label: 'First' }, { id: 'i2', label: 'Second' }] },
          key: { correct_order: ['i2', 'i1'] },
        },
      ],
    })
    expect(steps[0]?.disabled).toBe(true)
    expect(steps[0]?.answers).toEqual(['Cat → Meow'])
    expect(steps[1]?.answers).toEqual(['1. Second', '2. First'])
  })

  it('does not throw on half-typed content', () => {
    expect(previewSteps(null)).toEqual([])
    expect(previewSteps({ steps: 'nope' })).toEqual([])
    const steps = previewSteps({ steps: [null, { type: 7 }, { id: 'x', type: 'single_choice', config: { options: 'bad' } }] })
    expect(steps.map((s) => s.type)).toEqual(['unreadable', 'unreadable', 'single_choice'])
    expect(steps[2]?.answers).toEqual([])
  })
})
