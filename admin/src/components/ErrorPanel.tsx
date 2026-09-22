import { ApiError, friendlyMessage } from '../api/errors'

interface Props {
  error: Error
  onRetry?: () => void
  /** Overrides the generic wording for a known code, e.g. what "not found" means on this page. */
  messages?: Partial<Record<string, string>>
}

/** The standard way to show a failed request: plain wording first, technical detail (with the request ID) on demand. */
export function ErrorPanel({ error, onRetry, messages }: Props) {
  const api = error instanceof ApiError ? error : null
  const headline = api ? (messages?.[api.code] ?? friendlyMessage(api)) : 'Something went wrong.'
  return (
    <div className="panel panel-error" role="alert">
      <p className="panel-title">{headline}</p>
      {api && api.problems.length > 0 && (
        <ul className="problems" aria-label="Problems">
          {api.problems.map((problem, i) => (
            <li key={i}>{problem}</li>
          ))}
        </ul>
      )}
      {api && api.retryAfterSeconds !== null && <p>Try again in about {Math.ceil(api.retryAfterSeconds / 60)} minute(s).</p>}
      <details>
        <summary>Technical details</summary>
        <dl className="details">
          {api && (
            <>
              <dt>Status</dt>
              <dd>{api.status === 0 ? 'no response' : api.status}</dd>
              <dt>Code</dt>
              <dd>
                <code>{api.code}</code>
              </dd>
            </>
          )}
          <dt>Message</dt>
          <dd>{error.message}</dd>
          {api?.details.map((d, i) => (
            <div key={i} className="details-row">
              <dt>{d.loc.join('.') || 'request'}</dt>
              <dd>{d.msg}</dd>
            </div>
          ))}
          {api?.requestId && (
            <>
              <dt>Request ID</dt>
              <dd>
                <code>{api.requestId}</code>
              </dd>
            </>
          )}
        </dl>
      </details>
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}
