import { Navigate, type RouteObject } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { RequireAdmin } from './auth/RequireAdmin'
import { RequireStaff } from './auth/RequireStaff'
import { Layout } from './components/Layout'
import { ActivitiesPage } from './pages/ActivitiesPage'
import { ActivityBuilderPage } from './pages/ActivityBuilderPage'
import { ActivityEditorPage } from './pages/ActivityEditorPage'
import { ActivityLogPage } from './pages/ActivityLogPage'
import { ChangePasswordPage } from './pages/ChangePasswordPage'
import { DashboardPage } from './pages/DashboardPage'
import { EducatorDetailPage } from './pages/EducatorDetailPage'
import { EducatorsPage } from './pages/EducatorsPage'
import { ImportPage } from './pages/ImportPage'
import { LoginPage } from './pages/LoginPage'
import { NewActivityPage } from './pages/NewActivityPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ReviewPage } from './pages/ReviewPage'

/** Admins land on the dashboard; educators have no dashboard, so their home is their own list. */
function Home() {
  const { isAdmin } = useAuth()
  return isAdmin ? <DashboardPage /> : <Navigate to="/activities" replace />
}

/** Educators work in the guided builder; admins get the review and JSON view (which links to the builder for drafts). */
function ActivityRoute() {
  const { isAdmin } = useAuth()
  return isAdmin ? <ActivityEditorPage /> : <ActivityBuilderPage />
}

export const appRoutes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/change-password', element: <ChangePasswordPage /> },
  {
    element: <RequireStaff />,
    children: [
      {
        element: <Layout />,
        children: [
          { index: true, element: <Home /> },
          { path: 'activities', element: <ActivitiesPage /> },
          { path: 'activities/new', element: <NewActivityPage /> },
          { path: 'activities/:id', element: <ActivityRoute /> },
          { path: 'activities/:id/build', element: <ActivityBuilderPage /> },
          {
            element: <RequireAdmin />,
            children: [
              { path: 'review', element: <ReviewPage /> },
              { path: 'educators', element: <EducatorsPage /> },
              { path: 'educators/:id', element: <EducatorDetailPage /> },
              { path: 'activity-log', element: <ActivityLogPage /> },
              { path: 'import', element: <ImportPage /> },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]
