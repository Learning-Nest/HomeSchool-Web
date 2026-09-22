import { useRef } from 'react'
import type { JsonSyntaxError } from '../domain/json'

interface Props {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error: JsonSyntaxError | null
  disabled?: boolean
}

/** A monospace textarea with a line-number gutter. Lines never wrap, so the numbers always line up. */
export function JsonEditor({ id, label, value, onChange, error, disabled }: Props) {
  const gutterRef = useRef<HTMLPreElement>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const lineCount = value.split('\n').length
  const numbers = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n')

  function jumpToError() {
    const area = areaRef.current
    if (!area || !error) return
    area.focus()
    area.setSelectionRange(error.position, Math.min(error.position + 1, value.length))
  }

  return (
    <div className="json-editor">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className={error ? 'editor-frame editor-invalid' : 'editor-frame'}>
        <pre ref={gutterRef} className="gutter" aria-hidden="true">
          {numbers}
        </pre>
        <textarea
          ref={areaRef}
          id={id}
          className="editor-area"
          value={value}
          spellCheck={false}
          wrap="off"
          autoCapitalize="off"
          autoCorrect="off"
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-status`}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop
          }}
        />
      </div>
      <p id={`${id}-status`} className={error ? 'editor-status status-bad' : 'editor-status status-good'} role="status">
        {error ? (
          <>
            JSON error at line {error.line}, column {error.column}: {error.message}.{' '}
            <button type="button" className="link-button" onClick={jumpToError}>
              Jump to error
            </button>
          </>
        ) : (
          'JSON syntax is valid.'
        )}
      </p>
    </div>
  )
}
