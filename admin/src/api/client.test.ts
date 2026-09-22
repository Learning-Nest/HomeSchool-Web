import { describe, expect, it, vi } from 'vitest'
import { ApiError } from './errors'
import { memoryStore } from './sessionStore'
import { apiError, json, makeClient, storedSession, tokenOut } from '../test/fakeApi'

const NOW = 1_000_000

describe('token refresh', () => {
  it('runs a single refresh for parallel 401s and retries every request with the new token', async () => {
    let refreshes = 0
    const { client, calls, store } = makeClient(
      {
        'GET /v1/admin/stats': ({ headers }) =>
          headers.get('Authorization') === 'Bearer access-2' ? json(200, { ok: true }) : apiError(401, 'unauthenticated'),
        'POST /v1/auth/refresh': async () => {
          refreshes += 1
          await new Promise((r) => setTimeout(r, 20))
          return json(200, tokenOut(2))
        },
      },
      { session: storedSession(1, NOW + 900_000), now: () => NOW },
    )

    const results = await Promise.all([client.get('/admin/stats'), client.get('/admin/stats'), client.get('/admin/stats')])

    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }])
    expect(refreshes).toBe(1)
    expect(calls.filter((c) => c.path === '/v1/admin/stats')).toHaveLength(6)
    expect(store.load()?.tokens.refreshToken).toBe('refresh-2')
  })

  it('stores the rotated pair before the retried request goes out, and never sends the old refresh token twice', async () => {
    const store = memoryStore(storedSession(1, NOW + 900_000))
    let storedWhenRetried: string | undefined
    const { client, calls } = makeClient(
      {
        'GET /v1/admin/stats': ({ headers }) => {
          if (headers.get('Authorization') === 'Bearer access-1') return apiError(401, 'unauthenticated')
          storedWhenRetried = store.load()?.tokens.refreshToken
          return json(200, {})
        },
        'POST /v1/auth/refresh': () => json(200, tokenOut(2)),
      },
      { store, now: () => NOW },
    )

    await client.get('/admin/stats')
    await client.get('/admin/stats')

    expect(storedWhenRetried).toBe('refresh-2')
    const sent = calls.filter((c) => c.path === '/v1/auth/refresh').map((c) => (c.body as { refresh_token: string }).refresh_token)
    expect(sent).toEqual(['refresh-1'])
  })

  it('does not refresh again when another request already rotated the token this one used', async () => {
    let releaseSlow: (r: Response) => void = () => {}
    let slowSeen = false
    const { client, calls } = makeClient(
      {
        'GET /v1/admin/slow': ({ headers }) => {
          if (headers.get('Authorization') === 'Bearer access-1' && !slowSeen) {
            slowSeen = true
            return new Promise<Response>((resolve) => (releaseSlow = resolve))
          }
          return json(200, { slow: 'done' })
        },
        'GET /v1/admin/fast': ({ headers }) =>
          headers.get('Authorization') === 'Bearer access-1' ? apiError(401, 'unauthenticated') : json(200, { fast: true }),
        'POST /v1/auth/refresh': () => json(200, tokenOut(2)),
      },
      { now: () => NOW, session: storedSession(1, NOW + 900_000) },
    )

    const slow = client.get('/admin/slow')
    await client.get('/admin/fast') // triggers the rotation while the slow request is still out
    releaseSlow(apiError(401, 'unauthenticated'))

    await expect(slow).resolves.toEqual({ slow: 'done' })
    expect(calls.filter((c) => c.path === '/v1/auth/refresh')).toHaveLength(1)
  })

  it('refreshes ahead of time when the access token is about to expire', async () => {
    const { client, calls } = makeClient(
      {
        'GET /v1/admin/stats': ({ headers }) => json(200, { token: headers.get('Authorization') }),
        'POST /v1/auth/refresh': () => json(200, tokenOut(2)),
      },
      { session: storedSession(1, NOW + 5_000), now: () => NOW },
    )

    await expect(client.get('/admin/stats')).resolves.toEqual({ token: 'Bearer access-2' })
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /v1/auth/refresh', 'GET /v1/admin/stats'])
  })

  it('signs out and clears storage when the server refuses the refresh token', async () => {
    const { client, store } = makeClient(
      {
        'GET /v1/admin/stats': () => apiError(401, 'unauthenticated'),
        'POST /v1/auth/refresh': () => apiError(401, 'unauthenticated'),
      },
      { now: () => NOW, session: storedSession(1, NOW + 900_000) },
    )
    const ended = vi.fn()
    client.onSessionEnd(ended)

    await expect(client.get('/admin/stats')).rejects.toMatchObject({ status: 401 })

    expect(ended).toHaveBeenCalledExactlyOnceWith('session_expired')
    expect(store.load()).toBeNull()
    expect(client.user).toBeNull()
  })

  it('keeps the session when the refresh call fails for network reasons', async () => {
    const { client, store } = makeClient(
      {
        'GET /v1/admin/stats': () => apiError(401, 'unauthenticated'),
        'POST /v1/auth/refresh': () => {
          throw new TypeError('Failed to fetch')
        },
      },
      { now: () => NOW, session: storedSession(1, NOW + 900_000) },
    )
    const ended = vi.fn()
    client.onSessionEnd(ended)

    await expect(client.get('/admin/stats')).rejects.toMatchObject({ code: 'network_error' })

    expect(ended).not.toHaveBeenCalled()
    expect(store.load()?.tokens.refreshToken).toBe('refresh-1')
  })

  it('signs out when a freshly refreshed token is still refused', async () => {
    const { client } = makeClient(
      {
        'GET /v1/admin/stats': () => apiError(401, 'unauthenticated'),
        'POST /v1/auth/refresh': () => json(200, tokenOut(2)),
      },
      { now: () => NOW, session: storedSession(1, NOW + 900_000) },
    )
    const ended = vi.fn()
    client.onSessionEnd(ended)

    await expect(client.get('/admin/stats')).rejects.toMatchObject({ status: 401 })
    expect(ended).toHaveBeenCalledExactlyOnceWith('session_expired')
  })

  it('does not treat a 403 as a reason to refresh', async () => {
    const { client, calls } = makeClient({ 'GET /v1/admin/stats': () => apiError(403, 'forbidden') }, { now: () => NOW })
    await expect(client.get('/admin/stats')).rejects.toMatchObject({ status: 403, code: 'forbidden' })
    expect(calls).toHaveLength(1)
  })
})

describe('sign-out and login', () => {
  it('logout revokes the newest refresh token and clears the session', async () => {
    const { client, calls, store } = makeClient(
      { 'POST /v1/auth/logout': () => json(204, null) },
      { now: () => NOW, session: storedSession(4, NOW + 900_000) },
    )
    const ended = vi.fn()
    client.onSessionEnd(ended)

    await client.signOut()

    expect(calls[0]?.body).toEqual({ refresh_token: 'refresh-4' })
    expect(ended).toHaveBeenCalledExactlyOnceWith('signed_out')
    expect(store.load()).toBeNull()
  })

  it('still signs out locally when the logout call fails', async () => {
    const { client, store } = makeClient(
      {
        'POST /v1/auth/logout': () => {
          throw new TypeError('offline')
        },
      },
      { now: () => NOW },
    )
    await client.signOut()
    expect(store.load()).toBeNull()
  })

  it('waits for a rotation in flight so it logs out with the new token', async () => {
    const { client, calls } = makeClient(
      {
        'GET /v1/admin/stats': ({ headers }) =>
          headers.get('Authorization') === 'Bearer access-1' ? apiError(401, 'unauthenticated') : json(200, {}),
        'POST /v1/auth/refresh': async () => {
          await new Promise((r) => setTimeout(r, 20))
          return json(200, tokenOut(2))
        },
        'POST /v1/auth/logout': () => json(204, null),
      },
      { now: () => NOW, session: storedSession(1, NOW + 900_000) },
    )

    const pending = client.get('/admin/stats')
    await new Promise((r) => setTimeout(r, 0))
    await client.signOut()
    await pending.catch(() => undefined)

    const logout = calls.find((c) => c.path === '/v1/auth/logout')
    expect(logout?.body).toEqual({ refresh_token: 'refresh-2' })
  })

  it('login does not keep the tokens until startSession is called', async () => {
    const { client, store } = makeClient({ 'POST /v1/auth/login': () => json(200, tokenOut(7)) }, { session: null })
    const out = await client.login('a@b.co', 'pw')
    expect(client.user).toBeNull()
    expect(store.load()).toBeNull()
    client.startSession(out)
    expect(client.user?.email).toBe('editor@example.com')
    expect(store.load()?.tokens.refreshToken).toBe('refresh-7')
  })

  it('sends no Authorization header on login', async () => {
    const { client, calls } = makeClient({ 'POST /v1/auth/login': () => json(200, tokenOut(1)) }, { session: null })
    await client.login('a@b.co', 'pw')
    expect(calls[0]?.headers.has('Authorization')).toBe(false)
  })
})

describe('requests and error mapping', () => {
  it('sends the bearer token, a request id and only the query values that are set', async () => {
    const { client, calls } = makeClient({ 'GET /v1/admin/activities': () => json(200, []) }, { now: () => NOW })
    await client.get('/admin/activities', { query: { status: 'draft', subject: '', q: undefined, limit: 26, offset: 0 } })

    const call = calls[0]!
    expect(call.headers.get('Authorization')).toBe('Bearer access-1')
    expect(call.headers.get('X-Request-Id')).toBeTruthy()
    expect([...call.query.entries()]).toEqual([
      ['status', 'draft'],
      ['limit', '26'],
      ['offset', '0'],
    ])
  })

  it('maps the standard error body, including problems and the request id', async () => {
    const { client } = makeClient(
      { 'PUT /v1/admin/activities/a1/definition': () => apiError(422, 'content_invalid', { problems: ['steps/0: bad', 'level_from is above level_to'] }) },
      { now: () => NOW },
    )
    const error = await client.put('/admin/activities/a1/definition', { definition: {} }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 422,
      code: 'content_invalid',
      requestId: 'req-123',
      problems: ['steps/0: bad', 'level_from is above level_to'],
    })
  })

  it('maps validation_error details and retry_after_seconds', async () => {
    const { client } = makeClient(
      {
        'POST /v1/auth/login': () =>
          apiError(422, 'validation_error', { details: [{ loc: ['body', 'email'], msg: 'not an email' }] }),
        'GET /v1/admin/stats': () => apiError(429, 'rate_limited', { retry_after_seconds: 120 }),
      },
      { now: () => NOW },
    )
    await expect(client.login('x', 'y')).rejects.toMatchObject({ details: [{ loc: ['body', 'email'], msg: 'not an email' }] })
    await expect(client.get('/admin/stats')).rejects.toMatchObject({ code: 'rate_limited', retryAfterSeconds: 120 })
  })

  it('falls back to the X-Request-Id header and a generic code for non-standard error bodies', async () => {
    const { client } = makeClient(
      { 'GET /v1/admin/stats': () => new Response('<html>Bad gateway</html>', { status: 502, headers: { 'X-Request-Id': 'gw-9' } }) },
      { now: () => NOW },
    )
    await expect(client.get('/admin/stats')).rejects.toMatchObject({ status: 502, code: 'http_error', requestId: 'gw-9' })
  })

  it('reports an unreachable API as network_error', async () => {
    const { client } = makeClient(
      {
        'GET /v1/admin/stats': () => {
          throw new TypeError('Failed to fetch')
        },
      },
      { now: () => NOW },
    )
    await expect(client.get('/admin/stats')).rejects.toMatchObject({ status: 0, code: 'network_error' })
  })

  it('rejects a 200 response that is not JSON', async () => {
    const { client } = makeClient({ 'GET /v1/admin/stats': () => new Response('oops', { status: 200 }) }, { now: () => NOW })
    await expect(client.get('/admin/stats')).rejects.toMatchObject({ code: 'invalid_response' })
  })
})
