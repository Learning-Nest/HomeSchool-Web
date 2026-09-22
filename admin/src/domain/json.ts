export interface JsonSyntaxError {
  message: string
  /** Zero-based character offset of the problem. */
  position: number
  line: number
  column: number
}

export type JsonObjectResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: JsonSyntaxError }

const MAX_DEPTH = 200
const WHITESPACE = new Set([' ', '\t', '\n', '\r'])

class SyntaxProblem extends Error {
  readonly position: number
  constructor(message: string, position: number) {
    super(message)
    this.position = position
  }
}

/**
 * Locates the first syntax error in JSON text. JSON.parse messages differ between browsers and often carry no
 * position, so the editor uses this small validator to say where the problem is.
 */
function scan(text: string): void {
  let i = 0

  const describe = (at: number) => (at >= text.length ? 'the end of the text' : `"${text[at]}"`)
  const skipSpace = () => {
    while (i < text.length && WHITESPACE.has(text[i]!)) i++
  }

  const string = () => {
    const start = i
    i++
    while (i < text.length) {
      const c = text[i]!
      if (c === '"') {
        i++
        return
      }
      if (c < ' ') throw new SyntaxProblem('Line breaks and control characters must be escaped inside a string', i)
      if (c === '\\') {
        const e = text[i + 1]
        if (e === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) throw new SyntaxProblem('Invalid \\u escape', i)
          i += 6
          continue
        }
        if (e === undefined || !'"\\/bfnrt'.includes(e)) throw new SyntaxProblem('Invalid escape sequence', i)
        i += 2
        continue
      }
      i++
    }
    throw new SyntaxProblem('This string is never closed', start)
  }

  const number = () => {
    const match = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i))
    if (!match) throw new SyntaxProblem('Invalid number', i)
    i += match[0].length
  }

  const value = (depth: number) => {
    if (depth > MAX_DEPTH) throw new SyntaxProblem('Nested too deeply', i)
    skipSpace()
    const c = text[i]
    if (c === '{') return object(depth)
    if (c === '[') return array(depth)
    if (c === '"') return string()
    if (c === '-' || (c !== undefined && c >= '0' && c <= '9')) return number()
    for (const word of ['true', 'false', 'null']) {
      if (text.startsWith(word, i)) {
        i += word.length
        return
      }
    }
    throw new SyntaxProblem(
      i >= text.length ? 'The text ends where a value was expected' : `Unexpected ${describe(i)}; expected a value`,
      i,
    )
  }

  const object = (depth: number) => {
    i++
    skipSpace()
    if (text[i] === '}') {
      i++
      return
    }
    for (;;) {
      skipSpace()
      if (text[i] === '}') throw new SyntaxProblem('Trailing comma before "}"', i)
      if (text[i] !== '"') throw new SyntaxProblem(`Expected a property name in double quotes, found ${describe(i)}`, i)
      string()
      skipSpace()
      if (text[i] !== ':') throw new SyntaxProblem(`Expected ":" after the property name, found ${describe(i)}`, i)
      i++
      value(depth + 1)
      skipSpace()
      if (text[i] === ',') {
        i++
        continue
      }
      if (text[i] === '}') {
        i++
        return
      }
      throw new SyntaxProblem(`Expected "," or "}", found ${describe(i)}`, i)
    }
  }

  const array = (depth: number) => {
    i++
    skipSpace()
    if (text[i] === ']') {
      i++
      return
    }
    for (;;) {
      skipSpace()
      if (text[i] === ']') throw new SyntaxProblem('Trailing comma before "]"', i)
      value(depth + 1)
      skipSpace()
      if (text[i] === ',') {
        i++
        continue
      }
      if (text[i] === ']') {
        i++
        return
      }
      throw new SyntaxProblem(`Expected "," or "]", found ${describe(i)}`, i)
    }
  }

  value(0)
  skipSpace()
  if (i < text.length) throw new SyntaxProblem(`Unexpected ${describe(i)} after the end of the JSON value`, i)
}

export function lineAndColumn(text: string, position: number): { line: number; column: number } {
  const before = text.slice(0, position)
  const line = before.split('\n').length
  return { line, column: position - (before.lastIndexOf('\n') + 1) + 1 }
}

function failure(text: string, message: string, position: number): JsonObjectResult {
  return { ok: false, error: { message, position, ...lineAndColumn(text, position) } }
}

/** Parses editor text that must be a single JSON object (an activity definition or a bundle). */
export function parseJsonObject(text: string): JsonObjectResult {
  if (text.trim() === '') return failure(text, 'Enter a JSON object', 0)
  try {
    scan(text)
  } catch (e) {
    if (e instanceof SyntaxProblem) return failure(text, e.message, e.position)
    throw e
  }
  const value: unknown = JSON.parse(text)
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return failure(text, 'The top level must be a JSON object ({ ... })', text.search(/\S/))
  }
  return { ok: true, value: value as Record<string, unknown> }
}

export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}
