import { describe, expect, it } from 'vitest'
import { formatJson, lineAndColumn, parseJsonObject } from './json'

function failure(text: string) {
  const result = parseJsonObject(text)
  if (result.ok) throw new Error('expected a syntax error')
  return result.error
}

describe('parseJsonObject', () => {
  it('accepts an object and returns the value', () => {
    const result = parseJsonObject('{"slug": "a", "steps": [1, 2.5, -3e2, true, null, "x\\n\\u00e9"]}')
    expect(result).toEqual({ ok: true, value: { slug: 'a', steps: [1, 2.5, -300, true, null, 'x\né'] } })
  })

  it('reports line and column of a missing comma', () => {
    const error = failure('{\n  "a": 1\n  "b": 2\n}')
    expect(error).toMatchObject({ line: 3, column: 3 })
    expect(error.message).toMatch(/Expected "," or "}"/)
  })

  it('reports a trailing comma', () => {
    expect(failure('{"a": [1, 2,]}').message).toMatch(/Trailing comma before "]"/)
    expect(failure('{"a": 1,}').message).toMatch(/Trailing comma before "}"/)
  })

  it('reports single-quoted property names and unquoted values', () => {
    expect(failure("{'a': 1}").message).toMatch(/property name in double quotes/)
    expect(failure('{"a": nope}').message).toMatch(/expected a value/)
  })

  it('reports unterminated strings at the opening quote', () => {
    const error = failure('{"a": "never closed}')
    expect(error.message).toMatch(/never closed/)
    expect(error.position).toBe(6)
  })

  it('reports raw line breaks inside strings and bad escapes', () => {
    expect(failure('{"a": "x\ny"}').message).toMatch(/control characters/)
    expect(failure('{"a": "\\q"}').message).toMatch(/Invalid escape/)
    expect(failure('{"a": "\\u12"}').message).toMatch(/\\u escape/)
  })

  it('reports invalid numbers and trailing content', () => {
    expect(failure('{"a": 01}').message).toMatch(/Expected "," or "}"/)
    expect(failure('{"a": -}').message).toMatch(/Invalid number/)
    expect(failure('{"a": 1} x').message).toMatch(/after the end/)
  })

  it('reports truncated input', () => {
    expect(failure('{"a": ').message).toMatch(/ends where a value was expected/)
    expect(failure('{"a": 1').message).toMatch(/end of the text/)
  })

  it('requires an object at the top level', () => {
    expect(failure('[1, 2]').message).toMatch(/top level must be a JSON object/)
    expect(failure('"text"').message).toMatch(/top level must be a JSON object/)
    expect(failure('   ').message).toMatch(/Enter a JSON object/)
  })

  it('does not overflow the stack on deeply nested input', () => {
    expect(failure('['.repeat(5000)).message).toMatch(/Nested too deeply/)
  })

  it('agrees with JSON.parse on valid documents', () => {
    const doc = { a: [1, { b: 'c' }], d: null, e: 'ü' }
    expect(parseJsonObject(JSON.stringify(doc))).toEqual({ ok: true, value: doc })
  })
})

describe('helpers', () => {
  it('computes one-based line and column', () => {
    expect(lineAndColumn('ab\ncd', 4)).toEqual({ line: 2, column: 2 })
  })

  it('formats with two-space indentation', () => {
    expect(formatJson({ a: [1] })).toBe('{\n  "a": [\n    1\n  ]\n}')
  })
})
