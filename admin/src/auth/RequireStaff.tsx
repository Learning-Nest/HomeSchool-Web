import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

/**
 * Route guard: everything inside needs a signed-in educator or content admin. An account that signed in with a
 * temporary password can only reach the "choose a new password" page.
 */
export function RequireStaff() {
  const { user, mustChangePassword } = useAuth()
  const location = useLocation()
  if (!user) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  }
  if (mustChangePassword) return <Navigate to="/change-password" replace />
  return <Outlet />
}
