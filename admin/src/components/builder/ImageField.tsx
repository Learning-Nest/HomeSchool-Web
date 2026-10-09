import { useId, useState } from 'react'
import type { ImageRef } from '../../domain/builder'
import { ErrorPanel } from '../ErrorPanel'
import { ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_BYTES, useBuilder } from './BuilderContext'

interface Props {
  /** Names the picture for screen readers and buttons, e.g. "Picture for choice B". */
  label: string
  value: ImageRef | undefined
  onChange(next: ImageRef | undefined): void
  /** Smaller layout for choices inside a list. */
  compact?: boolean
}

/** Clear wording for problems we can see before sending the file. */
export function checkImageFile(file: { type: string; size: number }): string | null {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return 'Use a JPEG, PNG or WebP picture.'
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `This picture is ${(file.size / (1024 * 1024)).toFixed(1)} MB. Pictures can be up to ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`
  }
  return null
}

/** One optional picture: upload a new file or reuse one already uploaded to this activity, and describe it. */
export function ImageField({ label, value, onChange, compact }: Props) {
  const { assets, upload, readOnly } = useBuilder()
  const inputId = useId()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const asset = value ? assets.find((a) => a.id === value.asset) : undefined

  async function onFile(file: File | undefined) {
    if (!file) return
    setProblem(null)
    setError(null)
    const bad = checkImageFile(file)
    if (bad) {
      setProblem(bad)
      return
    }
    setBusy(true)
    try {
      const uploaded = await upload(file)
      onChange({ asset: uploaded.id, alt: value?.alt ?? '' })
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={compact ? 'image-field image-field-compact' : 'image-field'}>
      {value ? (
        <>
          <div className="image-preview">
            {asset?.url ? (
              <img src={asset.url} alt={value.alt} />
            ) : (
              <span className="pic-missing" role="img" aria-label={value.alt || 'Picture'}>
                Preview not available
              </span>
            )}
          </div>
          <label className="field">
            <span className="field-label">Describe the picture ({label})</span>
            <input
              type="text"
              maxLength={200}
              value={value.alt}
              disabled={readOnly}
              onChange={(e) => onChange({ asset: value.asset, alt: e.target.value })}
              aria-invalid={value.alt.trim() === '' ? true : undefined}
            />
          </label>
          {!readOnly && (
            <button type="button" className="btn btn-small" onClick={() => onChange(undefined)}>
              Remove picture
            </button>
          )}
        </>
      ) : (
        !readOnly && (
          <>
            <label className="btn btn-small file-button" htmlFor={inputId}>
              {busy ? 'Uploading…' : 'Add picture'}
              <span className="visually-hidden"> — {label}</span>
            </label>
            <input
              id={inputId}
              className="visually-hidden"
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(',')}
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                void onFile(file)
              }}
            />
            {assets.length > 0 && (
              <label className="field field-inline">
                <span className="visually-hidden">Reuse an uploaded picture for {label}</span>
                <select
                  value=""
                  disabled={busy}
                  onChange={(e) => {
                    if (e.target.value) onChange({ asset: e.target.value, alt: '' })
                  }}
                >
                  <option value="">or reuse one…</option>
                  {assets.map((a, i) => (
                    <option key={a.id} value={a.id}>
                      Picture {i + 1} ({a.width}×{a.height})
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )
      )}
      {problem && (
        <p className="field-error" role="alert">
          {problem}
        </p>
      )}
      {error && <ErrorPanel error={error} />}
    </div>
  )
}
