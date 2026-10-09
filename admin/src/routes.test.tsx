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

describe('educator accounts', () => {
  const educator = () => ({ session: storedSession(1, Date.now() + 900_000, 'educator') })

  it('signs an educator in and lands on their own activities, with only their menu', async () => {
    const { client, calls } = makeClient(
      {
        'POST /v1/auth/login': () => json(200, tokenOut(1, 'educator')),
        'GET /v1/admin/activities': () => json(200, []),
      },
      { session: null },
    )
    const { router } = renderApp(client, '/')
    await signInAs('eve@example.com', 'secret-password')

    expect(await screen.findByRole('heading', { name: 'My activities' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/activities')
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(Array.from(nav.querySelectorAll('a')).map((a) => a.textContent)).toEqual(['My activities', 'New activity'])
    expect(calls.some((c) => c.path === '/v1/admin/stats')).toBe(false)
  })

  it('keeps an educator out of the admin-only pages', async () => {
    for (const path of ['/review', '/educators', '/activity-log', '/import']) {
      const { client } = makeClient({ 'GET /v1/admin/activities': () => json(200, []) }, educator())
      const { router, unmount } = renderApp(client, path)
      await waitFor(() => expect(router.state.location.pathname).toBe('/activities'))
      unmount()
    }
  })

  it('forces a temporary password to be replaced before anything else', async () => {
    const { client, calls } = makeClient(
      {
        'POST /v1/auth/login': () => json(200, { ...tokenOut(1, 'educator'), temp_login: true }),
        'POST /v1/auth/change-password': () => json(200, tokenOut(2, 'educator')),
        'GET /v1/admin/activities': () => json(200, []),
      },
      { session: null },
    )
    const { router } = renderApp(client, '/activities')
    await signInAs('eve@example.com', 'temp-from-email')

    expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/change-password')
    expect(calls.some((c) => c.path === '/v1/admin/activities')).toBe(false)

    const submit = screen.getByRole('button', { name: /Save|Change|Set/ }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Temporary password'), { target: { value: 'temp-from-email' } })
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'short' } })
    fireEvent.change(screen.getByLabelText('New password again'), { target: { value: 'short' } })
    expect(submit.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'a-much-longer-passphrase' } })
    fireEvent.change(screen.getByLabelText('New password again'), { target: { value: 'a-much-longer-passphrase' } })
    expect(submit.disabled).toBe(false)
    fireEvent.click(submit)

    expect(await screen.findByRole('heading', { name: 'My activities' })).toBeTruthy()
    expect(calls.find((c) => c.path === '/v1/auth/change-password')?.body).toEqual({
      current_password: 'temp-from-email',
      new_password: 'a-much-longer-passphrase',
    })
    expect(client.mustChangePassword).toBe(false)
  })

  it('does not show the password page to someone who has no temporary password', async () => {
    const { client } = makeClient({ 'GET /v1/admin/activities': () => json(200, []) }, educator())
    const { router } = renderApp(client, '/change-password')
    await waitFor(() => expect(router.state.location.pathname).toBe('/activities'))
  })
})
