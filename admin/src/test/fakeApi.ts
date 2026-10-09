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

// ---- fixtures for the educator portal --------------------------------------------------------------------------

export const subjectsFixture = [
  { code: 'MAT', name: 'Mathematics', display_order: 1 },
  { code: 'LIT', name: 'Literacy', display_order: 2 },
]
export const levelsFixture = [
  { code: 'L1', name: 'Level 1', indicative_age: '5-6' },
  { code: 'L2', name: 'Level 2', indicative_age: '6-7' },
  { code: 'L3', name: 'Level 3', indicative_age: '7-8' },
]
export const skillsFixture = [
  { code: 'MAT.COUNT.TO10', subject_code: 'MAT', level_code: 'L1', name: 'Count to ten', prerequisites: [] },
  { code: 'MAT.ADD.TO10', subject_code: 'MAT', level_code: 'L2', name: 'Add within ten', prerequisites: [] },
]

export const assetFixture = (overrides: Record<string, unknown> = {}) => ({
  id: 'img1',
  activity_id: 'a1',
  content_type: 'image/png',
  bytes: 2048,
  width: 64,
  height: 64,
  sha256: 'a'.repeat(64),
  created_at: '2026-09-01T10:00:00Z',
  url: 'https://blob.test/img1.png?sig=x',
  ...overrides,
})

/** A draft in the v2 format that the guided builder can open. */
export const builderDetail = (overrides: Record<string, unknown> = {}) => ({
  ...activitySummary({ created_by_name: 'Eve Educator', last_edited_by_name: 'Eve Educator' }),
  skills: [],
  definition: {
    schema_version: 2,
    title: 'Count to ten',
    subject: 'MAT',
    level_from: 'L1',
    level_to: 'L2',
    duration_min: 15,
    steps: [
      { id: 's1', type: 'instruction', prompt: 'Count the apples.' },
      {
        id: 's2',
        type: 'single_choice',
        prompt: 'How many apples?',
        config: {
          options: [
            { id: 'a', label: 'Three' },
            { id: 'b', label: 'Ten' },
          ],
        },
        key: { correct: ['b'] },
        skills: [{ code: 'MAT.COUNT.TO10', weight: 1 }],
      },
    ],
  },
  ...overrides,
})

export const educatorSummary = (overrides: Record<string, unknown> = {}) => ({
  id: 'e1',
  email: 'eve@example.com',
  full_name: 'Eve Educator',
  active: true,
  platform_role: 'educator',
  created_at: '2026-08-01T09:00:00Z',
  activities: 3,
  drafts: 1,
  in_review: 1,
  published: 1,
  submissions: 2,
  returned: 1,
  last_active_at: '2026-09-02T09:00:00Z',
  ...overrides,
})

export const eventFixture = (overrides: Record<string, unknown> = {}) => ({
  id: 'ev1',
  at: '2026-09-02T09:00:00Z',
  action: 'submitted',
  actor_id: 'e1',
  actor_name: 'Eve Educator',
  activity_id: 'a1',
  activity_slug: 'count-to-ten',
  activity_title: 'Count to ten',
  version: 1,
  status_from: 'draft',
  status_to: 'in_review',
  detail: {},
  ...overrides,
})
