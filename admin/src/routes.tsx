import type { RouteObject } from 'react-router-dom'
import { RequireAdmin } from './auth/RequireAdmin'
import { Layout } from './components/Layout'
import { ActivitiesPage } from './pages/ActivitiesPage'
import { ActivityEditorPage } from './pages/ActivityEditorPage'
import { DashboardPage } from './pages/DashboardPage'
import { ImportPage } from './pages/ImportPage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'

export const appRoutes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAdmin />,
    children: [
      {
        element: <Layout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'activities', element: <ActivitiesPage /> },
          { path: 'activities/:id', element: <ActivityEditorPage /> },
          { path: 'import', element: <ImportPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]
