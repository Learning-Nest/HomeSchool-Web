import { useState, type ChangeEvent } from 'react'
import type { Bundle, BundleReport } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { BundleReportView } from '../components/BundleReportView'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorPanel } from '../components/ErrorPanel'
import { BUNDLE_ENTITIES, MAX_BUNDLE_BYTES, parseBundleText, type BundleParse } from '../domain/bundle'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

interface Loaded {
  name: string
  parse: BundleParse
}

interface DryRun {
  report: BundleReport
  autoPublish: boolean
}

export function ImportPage() {
  useDocumentTitle('Import content')
  const { api } = useAuth()
  const [file, setFile] = useState<Loaded | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [autoPublish, setAutoPublish] = useState(false)
  const [dryRun, setDryRun] = useState<DryRun | null>(null)
  const [applied, setApplied] = useState<BundleReport | null>(null)
  const [busy, setBusy] = useState<'dry' | 'apply' | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [confirming, setConfirming] = useState(false)

  const parsed = file?.parse.ok ? file.parse : null
  const bundle: Bundle | null = parsed?.bundle ?? null
  // An Apply is only offered for exactly what the last clean dry run checked.
  const canApply = bundle !== null && dryRun !== null && dryRun.report.ok && dryRun.autoPublish === autoPublish

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0]
    setDryRun(null)
    setApplied(null)
    setError(null)
    setFile(null)
    setFileError(null)
    if (!chosen) return
    if (chosen.size > MAX_BUNDLE_BYTES) {
      setFileError(`This file is ${(chosen.size / 1024 / 1024).toFixed(1)} MB; bundles can be at most 5 MB.`)
      return
    }
    setFile({ name: chosen.name, parse: parseBundleText(await chosen.text()) })
  }

  async function run(kind: 'dry' | 'apply') {
    if (!bundle) return
    setBusy(kind)
    setError(null)
    try {
      const report = await api.importBundle(bundle, { dryRun: kind === 'dry', autoPublish })
      if (kind === 'dry') {
        setDryRun({ report, autoPublish })
        setApplied(null)
      } else {
        setApplied(report)
        setDryRun(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setBusy(null)
      setConfirming(false)
    }
  }

  return (
    <>
      <h1>Import content</h1>
      <p className="muted">
        Upload a content bundle (.json with <code>version</code>, <code>levels</code>, <code>subjects</code>,{' '}
        <code>interests</code>, <code>skills</code> and <code>activities</code>). Every bundle is checked with a dry run
        first; nothing is saved until you apply it. Imports only add or update, they never delete.
      </p>

      <section className="panel" aria-labelledby="step1-heading">
        <h2 id="step1-heading">1. Choose a bundle</h2>
        <label className="field">
          <span className="field-label">Bundle file</span>
          <input type="file" accept=".json,application/json" onChange={(e) => void onFile(e)} />
        </label>
        {fileError && (
          <p className="status-bad" role="alert">
            {fileError}
          </p>
        )}
        {file && !file.parse.ok && (
          <p className="status-bad" role="alert">
            {file.name}: {file.parse.message}
          </p>
        )}
        {file && parsed && (
          <div>
            <p>
              <strong>{file.name}</strong>, bundle version <code>{parsed.bundle.version}</code>
            </p>
            <ul className="chips" aria-label="Bundle contents">
              {BUNDLE_ENTITIES.map((entity) => (
                <li key={entity}>
                  {parsed.counts[entity]} {entity}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="step2-heading">
        <h2 id="step2-heading">2. Check it</h2>
        <label className="check">
          <input type="checkbox" checked={autoPublish} onChange={(e) => setAutoPublish(e.target.checked)} />
          Also publish the imported activities
        </label>
        <p className="muted">
          Without this, new activities arrive as drafts. With it, valid activities become visible to children as soon as
          the import is applied.
        </p>
        <button type="button" className="btn btn-primary" disabled={!bundle || busy !== null} onClick={() => void run('dry')}>
          {busy === 'dry' ? 'Checking…' : 'Check bundle (dry run)'}
        </button>
      </section>

      {error && <ErrorPanel error={error} />}
      {dryRun && <BundleReportView report={dryRun.report} heading="Dry-run result" />}

      {dryRun && (
        <section className="panel" aria-labelledby="step3-heading">
          <h2 id="step3-heading">3. Apply</h2>
          {canApply ? (
            <p>The dry run found no problems. Applying saves these changes.</p>
          ) : (
            <p className="muted">
              {dryRun.report.ok
                ? 'The publish option changed since the dry run. Check the bundle again to enable Apply.'
                : 'Fix the problems above and check the bundle again. Apply stays disabled until a dry run is clean.'}
            </p>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canApply || busy !== null}
            onClick={() => (autoPublish ? setConfirming(true) : void run('apply'))}
          >
            {busy === 'apply' ? 'Applying…' : 'Apply import'}
          </button>
        </section>
      )}

      {applied && <BundleReportView report={applied} heading="Import result" />}

      {confirming && (
        <ConfirmDialog
          title="Apply and publish?"
          confirmLabel="Apply and publish"
          busy={busy === 'apply'}
          onConfirm={() => void run('apply')}
          onCancel={() => setConfirming(false)}
        >
          <p>This saves the bundle and publishes its activities, making them visible to children.</p>
        </ConfirmDialog>
      )}
    </>
  )
}
