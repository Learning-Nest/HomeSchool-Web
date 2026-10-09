import { ApiError, errorFromResponse, networkError } from './errors'
import type { SessionStore, StoredSession } from './sessionStore'
import type { TokenOut, User } from './types'

export type SessionEndReason = 'signed_out' | 'session_expired'

export interface ApiClientOptions {
  /** API origin without the /v1 prefix, e.g. https://api.example.com */
  baseUrl: string
  store: SessionStore
  fetchFn?: typeof fetch
  now?: () => number
  /** Refresh this long before the access token expires, so most requests never see a 401. */
  refreshSkewMs?: number
}

export interface RequestOptions {
  body?: unknown
  query?: Record<string, string | number | boolean | null | undefined>
  signal?: AbortSignal
  /** Send the bearer token (default). Login, refresh and logout do not. */
  auth?: boolean
  /** A file sent as the raw request body (image upload). Mutually exclusive with `body`. */
  raw?: { data: Blob; contentType: string }
  /** 'blob' returns the response body as a file (CSV export) instead of parsing JSON. */
  responseType?: 'json' | 'blob'
}

function requestId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).slice(2, 12)
}

/**
 * HTTP client for the API with the token handling from the client guide:
 * - refresh tokens rotate, so at most one refresh is ever in flight; parallel 401s wait for it;
 * - the new pair is stored before anything else uses it, and an old refresh token is never sent again;
 * - a request that got a 401 is retried once with the fresh access token;
 * - a refresh that the server rejects ends the session.
 */
export class ApiClient {
  private readonly baseUrl: string
  private readonly store: SessionStore
  private readonly fetchFn: typeof fetch
  private readonly now: () => number
  private readonly listeners = new Set<(reason: SessionEndReason) => void>()
  private readonly skewMs: number
  private session: StoredSession | null
  private refreshInFlight: Promise<void> | null = null

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl
    this.store = options.store
    this.fetchFn = options.fetchFn ?? ((...args) => fetch(...args))
    this.now = options.now ?? Date.now
    this.skewMs = options.refreshSkewMs ?? 30_000
    this.session = options.store.load()
  }

  get user(): User | null {
    return this.session?.user ?? null
  }

  /** Called when a session ends for any reason, including a refresh the server refused. Returns an unsubscribe function. */
  onSessionEnd(listener: (reason: SessionEndReason) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Signs in without keeping the tokens, so the caller can vet the account first (see startSession). */
  login(email: string, password: string): Promise<TokenOut> {
    return this.send<TokenOut>('POST', '/auth/login', { body: { email, password }, auth: false }, null)
  }

  startSession(out: TokenOut): void {
    this.setSession(out)
  }

  /** True while the stored session came from a temporary password and no new password has been set yet. */
  get mustChangePassword(): boolean {
    return this.session?.tempLogin === true
  }

  /** Sets a new password. The server signs every other session out and answers with a fresh token pair. */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const out = await this.post<TokenOut>('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    })
    this.setSession({ ...out, temp_login: false })
  }

  /** Revokes a refresh token on the server without ever having used it as a session. */
  async revoke(refreshToken: string): Promise<void> {
    try {
      await this.send<void>('POST', '/auth/logout', { body: { refresh_token: refreshToken }, auth: false }, null)
    } catch {
      /* the token is discarded either way */
    }
  }

  /** Drops a stored session without telling the server (used for a stored session that fails the role check). */
  discard(): void {
    this.session = null
    this.store.clear()
  }

  async signOut(): Promise<void> {
    // A rotation in flight would otherwise leave us revoking a token that is already replaced.
    if (this.refreshInFlight) await this.refreshInFlight.catch(() => undefined)
    const ended = this.session
    this.endSession('signed_out')
    if (ended) await this.revoke(ended.tokens.refreshToken)
  }

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    if (options.auth === false) return this.send<T>(method, path, options, null)

    await this.refreshIfExpiring()
    const used = this.accessToken()
    try {
      return await this.send<T>(method, path, options, used)
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401 || e.code !== 'unauthenticated') throw e
      await this.refresh(used)
      try {
        return await this.send<T>(method, path, options, this.accessToken())
      } catch (retryError) {
        // A brand-new access token was refused too: this session cannot be repaired.
        if (retryError instanceof ApiError && retryError.status === 401) this.endSession('session_expired')
        throw retryError
      }
    }
  }

  get<T>(path: string, options: Omit<RequestOptions, 'body'> = {}): Promise<T> {
    return this.request<T>('GET', path, options)
  }

  post<T>(path: string, body: unknown, options: Omit<RequestOptions, 'body'> = {}): Promise<T> {
    return this.request<T>('POST', path, { ...options, body })
  }

  put<T>(path: string, body: unknown, options: Omit<RequestOptions, 'body'> = {}): Promise<T> {
    return this.request<T>('PUT', path, { ...options, body })
  }

  patch<T>(path: string, body: unknown, options: Omit<RequestOptions, 'body'> = {}): Promise<T> {
    return this.request<T>('PATCH', path, { ...options, body })
  }

  delete(path: string, options: Omit<RequestOptions, 'body'> = {}): Promise<void> {
    return this.request<void>('DELETE', path, options)
  }

  /** Downloads a file (for example the activity-log CSV) with the bearer token attached. */
  download(path: string, options: Omit<RequestOptions, 'body' | 'responseType'> = {}): Promise<Blob> {
    return this.request<Blob>('GET', path, { ...options, responseType: 'blob' })
  }

  private accessToken(): string {
    if (!this.session) {
      throw new ApiError({ status: 401, code: 'unauthenticated', message: 'Not signed in.' })
    }
    return this.session.tokens.accessToken
  }

  private async refreshIfExpiring(): Promise<void> {
    const session = this.session
    if (session && session.tokens.accessExpiresAt - this.now() <= this.skewMs) {
      await this.refresh(session.tokens.accessToken)
    }
  }

  /**
   * `stale` is the access token the caller just used. When the current one differs, another request already
   * rotated the pair and there is nothing left to do: refreshing again would burn a good refresh token.
   */
  private refresh(stale: string): Promise<void> {
    if (this.refreshInFlight) return this.refreshInFlight
    const session = this.session
    if (!session) return Promise.reject(new ApiError({ status: 401, code: 'unauthenticated', message: 'Not signed in.' }))
    if (session.tokens.accessToken !== stale) return Promise.resolve()
    const run = this.rotate(session.tokens.refreshToken).finally(() => {
      if (this.refreshInFlight === run) this.refreshInFlight = null
    })
    this.refreshInFlight = run
    return run
  }

  private async rotate(refreshToken: string): Promise<void> {
    let out: TokenOut
    try {
      out = await this.send<TokenOut>('POST', '/auth/refresh', { body: { refresh_token: refreshToken }, auth: false }, null)
    } catch (e) {
      // The server refused the token (expired, revoked, reused): sign out. A network error or 5xx leaves
      // the stored token in place; if the server did rotate it, the next attempt is refused and signs out.
      if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 429) this.endSession('session_expired')
      throw e
    }
    this.setSession(out)
  }

  private setSession(out: TokenOut): void {
    this.session = {
      tokens: {
        accessToken: out.access_token,
        refreshToken: out.refresh_token,
        accessExpiresAt: this.now() + out.expires_in * 1000,
      },
      user: out.user,
      ...(out.temp_login ? { tempLogin: true } : {}),
    }
    this.store.save(this.session)
  }

  private endSession(reason: SessionEndReason): void {
    const had = this.session !== null
    this.discard()
    if (had) this.listeners.forEach((listener) => listener(reason))
  }

  private async send<T>(method: string, path: string, options: RequestOptions, token: string | null): Promise<T> {
    const url = new URL(`${this.baseUrl}/v1${path}`)
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
    }
    const headers: Record<string, string> = { Accept: 'application/json', 'X-Request-Id': requestId() }
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'
    if (options.raw) headers['Content-Type'] = options.raw.contentType
    if (options.responseType === 'blob') headers.Accept = '*/*'
    if (token) headers.Authorization = `Bearer ${token}`

    let response: Response
    try {
      response = await this.fetchFn(url, {
        method,
        headers,
        body: options.raw ? options.raw.data : options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: options.signal,
      })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e
      throw networkError(this.baseUrl)
    }

    if (response.ok && options.responseType === 'blob') return (await response.blob()) as T
    const text = response.status === 204 ? '' : await response.text()
    let parsed: unknown = undefined
    if (text) {
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = undefined
      }
    }
    if (!response.ok) throw errorFromResponse(response.status, parsed, response.headers.get('X-Request-Id'))
    if (text && parsed === undefined) {
      throw new ApiError({
        status: response.status,
        code: 'invalid_response',
        message: 'The server answered with something that is not JSON.',
        requestId: response.headers.get('X-Request-Id'),
      })
    }
    return parsed as T
  }
}
