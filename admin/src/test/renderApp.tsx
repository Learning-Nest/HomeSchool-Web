import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { ApiClient } from '../api/client'
import { AuthProvider } from '../auth/AuthContext'
import { appRoutes } from '../routes'

export function renderApp(client: ApiClient, path = '/') {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] })
  const view = render(
    <AuthProvider client={client}>
      <RouterProvider router={router} />
    </AuthProvider>,
  )
  return { router, ...view }
}
