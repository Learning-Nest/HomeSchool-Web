import { ApiClient } from '../api/client'
import { memoryStore, type SessionStore, type StoredSession } from '../api/sessionStore'
import type { TokenOut, User } from '../api/types'

export interface Call {
  method: string
  path: string
  query: URLSearchParams
  headers: Headers
  body: unknown
}

export type Handler = (call: Call) => Response | Promise<Response>

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

export function apiError(status: number, code: string, extra: Record<string, unknown> = {}): Response {
  return json(status, { error: { code, message: `${code} (server text)`, request_id: 'req-123', ...extra } })
}

/** A fetch that answers by "METHOD /v1/path" and records every call. Unhandled calls fail the test loudly. */
export function fakeFetch(handlers: Record<string, Handler>) {
  const calls: Call[] = []
  const fn = (async (input: URL | string, init: RequestInit = {}) => {
    const url = new URL(String(input))
    const method = init.method ?? 'GET'
    const call: Call = {
      method,
      path: url.pathname,
      query: url.searchParams,
      headers: new Headers(init.headers),
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    }
    calls.push(call)
    const handler = handlers[`${method} ${url.pathname}`]
    if (!handler) throw new Error(`Unhandled request in test: ${method} ${url.pathname}`)
    return handler(call)
  }) as unknown as typeof fetch
  return { fetch: fn, calls }
}

export function user(role: string | null = 'content_admin'): User {
  return { id: 'u1', email: 'editor@example.com', full_name: 'Ed Itor', platform_role: role }
}

export function tokenOut(n: number, role: string | null = 'content_admin', expiresIn = 900): TokenOut {
  return { access_token: `access-${n}`, refresh_token: `refresh-${n}`, expires_in: expiresIn, user: user(role) }
}

export function storedSession(n: number, expiresAt: number, role: string | null = 'content_admin'): StoredSession {
  return { tokens: { accessToken: `access-${n}`, refreshToken: `refresh-${n}`, accessExpiresAt: expiresAt }, user: user(role) }
}

export function makeClient(
  handlers: Record<string, Handler>,
  options: { session?: StoredSession | null; store?: SessionStore; now?: () => number } = {},
) {
  const { fetch, calls } = fakeFetch(handlers)
  const store = options.store ?? memoryStore(options.session === undefined ? storedSession(1, Date.now() + 900_000) : options.session)
  const client = new ApiClient({ baseUrl: 'https://api.test', store, fetchFn: fetch, now: options.now })
  return { client, calls, store }
}

export const activitySummary = (overrides: Record<string, unknown> = {}) => ({
  id: 'a1',
  slug: 'count-to-ten',
  title: 'Count to ten',
  summary: null,
  subject_code: 'MAT',
  level_from: 'L1',
  level_to: 'L2',
  duration_min: 15,
  materials: [],
  interest_tags: [],
  version: 1,
  status: 'draft',
  updated_at: '2026-09-01T10:00:00Z',
  ...overrides,
})

export const activityDetail = (overrides: Record<string, unknown> = {}) => ({
  ...activitySummary(),
  skills: ['MAT.COUNT.TO10'],
  definition: {
    slug: 'count-to-ten',
    title: 'Count to ten',
    subject: 'MAT',
    steps: [
      { id: 's1', type: 'instruction', text: 'Count the apples.' },
      {
        id: 's2',
        type: 'single_choice',
        prompt: 'How many apples?',
        options: [
          { id: 'a', label: 'Three' },
          { id: 'b', label: 'Ten' },
        ],
        correct: ['b'],
      },
      { id: 's3', type: 'parent_checklist', skill_code: 'MAT.COUNT.TO10', prompt: 'Did they count?' },
    ],
  },
  ...overrides,
})
