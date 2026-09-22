export interface ValidationDetail {
  loc: string[]
  msg: string
}

/** The standard error shape: {"error": {"code", "message", "request_id", ...extras}}. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId: string | null
  readonly problems: string[]
  readonly details: ValidationDetail[]
  readonly retryAfterSeconds: number | null

  constructor(init: {
    status: number
    code: string
    message: string
    requestId?: string | null
    problems?: string[]
    details?: ValidationDetail[]
    retryAfterSeconds?: number | null
  }) {
    super(init.message)
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code
    this.requestId = init.requestId ?? null
    this.problems = init.problems ?? []
    this.details = init.details ?? []
    this.retryAfterSeconds = init.retryAfterSeconds ?? null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []
}

function validationDetails(value: unknown): ValidationDetail[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).map((d) => ({
    loc: Array.isArray(d.loc) ? d.loc.map(String) : [],
    msg: typeof d.msg === 'string' ? d.msg : '',
  }))
}

/** Maps an HTTP failure to an ApiError. Tolerates bodies that are not in the standard shape (proxies, gateways). */
export function errorFromResponse(status: number, body: unknown, headerRequestId: string | null): ApiError {
  const err = isRecord(body) && isRecord(body.error) ? body.error : null
  if (!err) {
    return new ApiError({
      status,
      code: 'http_error',
      message: `The server answered ${status} without a standard error body.`,
      requestId: headerRequestId,
    })
  }
  return new ApiError({
    status,
    code: typeof err.code === 'string' ? err.code : 'http_error',
    message: typeof err.message === 'string' ? err.message : `HTTP ${status}`,
    requestId: typeof err.request_id === 'string' ? err.request_id : headerRequestId,
    problems: strings(err.problems),
    details: validationDetails(err.details),
    retryAfterSeconds: typeof err.retry_after_seconds === 'number' ? err.retry_after_seconds : null,
  })
}

export function networkError(apiBaseUrl: string): ApiError {
  return new ApiError({
    status: 0,
    code: 'network_error',
    message: `Could not reach the API at ${apiBaseUrl}.`,
  })
}

/** The wording shown to people. The server's own `message` is for logs, so it is only shown as a technical detail. */
export function friendlyMessage(error: ApiError): string {
  switch (error.code) {
    case 'invalid_credentials':
      return 'The email or password is incorrect.'
    case 'rate_limited':
      return 'Too many attempts. Wait a few minutes and try again.'
    case 'unauthenticated':
      return 'Your session has ended. Sign in again.'
    case 'forbidden':
      return 'Your account is not allowed to do this.'
    case 'not_found':
      return 'This item does not exist, or you cannot see it.'
    case 'conflict':
      return 'This change conflicts with the current state of the item. Reload and try again.'
    case 'validation_error':
      return 'The server rejected the request as invalid.'
    case 'content_invalid':
      return 'The content did not pass validation.'
    case 'network_error':
      return 'Could not reach the API. Check your connection and the API address, then try again.'
    case 'internal_error':
      return 'The server hit an unexpected error. Try again; if it keeps happening, share the request ID with an engineer.'
    default:
      return error.status >= 500 ? 'The server is having trouble. Try again shortly.' : 'The request failed.'
  }
}
