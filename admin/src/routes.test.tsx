import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { apiError, json, makeClient, storedSession, tokenOut } from './test/fakeApi'
import { renderApp } from './test/renderApp'

const stats = { users: 4, families: 2, skills: 51, activities_by_status: { draft: 3, published: 12 } }

async function signInAs(email: string, password: string) {
  fireEvent.change(await screen.findByLabelText('Email'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('route guard', () => {
  it('sends a signed-out visitor to the sign-in page and remembers where they were going', async () => {
    const { client } = makeClient({}, { session: null })
    const { router } = renderApp(client, '/activities?status=draft')

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.state).toEqual({ from: '/activities?status=draft' })
  })

  it('lets a signed-in content admin through and shows the dashboard', async () => {
    const { client } = makeClient({ 'GET /v1/admin/stats': () => json(200, stats) })
    renderApp(client, '/')

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy()
    expect(await screen.findByText('51')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Draft' }).getAttribute('href')).toBe('/activities?status=draft')
  })

  it('does not trust a stored session that belongs to a family account', async () => {
    const { client, store } = makeClient({}, { session: storedSession(1, Date.now() + 900_000, null) })
    renderApp(client, '/')

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy()
    expect(store.load()).toBeNull()
  })

  it('shows the not-found page inside the console for an unknown address', async () => {
    const { client } = makeClient({})
    renderApp(client, '/nope')
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy()
  })
})

describe('sign-in', () => {
  it('signs a content admin in and returns to the page they asked for', async () => {
    const { client, store } = makeClient(
      {
        'POST /v1/auth/login': () => json(200, tokenOut(1, 'super_admin')),
        'GET /v1/admin/stats': () => json(200, stats),
      },
      { session: null },
    )
    const { router } = renderApp(client, '/')
    await signInAs('editor@example.com', 'secret')

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/')
    expect(store.load()?.tokens.accessToken).toBe('access-1')
  })

  it('refuses a family account with a clear message, revokes its tokens and keeps no session', async () => {
    const { client, calls, store } = makeClient(
      {
        'POST /v1/auth/login': () => json(200, tokenOut(9, null)),
        'POST /v1/auth/logout': () => json(204, null),
      },
      { session: null },
    )
    renderApp(client, '/')
    await signInAs('parent@example.com', 'secret')

    expect((await screen.findByRole('alert')).textContent).toContain('does not have access to the content console')
    expect(store.load()).toBeNull()
    expect(client.user).toBeNull()
    expect(calls.find((c) => c.path === '/v1/auth/logout')?.body).toEqual({ refresh_token: 'refresh-9' })
    expect(calls.some((c) => c.path.startsWith('/v1/admin'))).toBe(false)
  })

  it('shows the friendly wording and the request id for wrong credentials', async () => {
    const { client } = makeClient({ 'POST /v1/auth/login': () => apiError(401, 'invalid_credentials') }, { session: null })
    renderApp(client, '/')
    await signInAs('editor@example.com', 'wrong')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('The email or password is incorrect.')
    expect(alert.textContent).toContain('req-123')
  })

  it('explains an expired session on the sign-in page and clears the console', async () => {
    const { client } = makeClient({
      'GET /v1/admin/stats': () => apiError(401, 'unauthenticated'),
      'POST /v1/auth/refresh': () => apiError(401, 'unauthenticated'),
    })
    renderApp(client, '/')

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy()
    expect((await screen.findByText(/Your session expired/)).textContent).toContain('Sign in again')
  })

  it('signs out through the header button', async () => {
    const { client, calls, store } = makeClient({
      'GET /v1/admin/stats': () => json(200, stats),
      'POST /v1/auth/logout': () => json(204, null),
    })
    renderApp(client, '/')
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy()
    await waitFor(() => expect(calls.some((c) => c.path === '/v1/auth/logout')).toBe(true))
    expect(store.load()).toBeNull()
  })
})

describe('error states', () => {
  it('shows a 403 from the admin API as an explained error with technical details', async () => {
    const { client } = makeClient({ 'GET /v1/admin/stats': () => apiError(403, 'forbidden') })
    renderApp(client, '/')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Your account is not allowed to do this.')
    expect(alert.textContent).toContain('req-123')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})
