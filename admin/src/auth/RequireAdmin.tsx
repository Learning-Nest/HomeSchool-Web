import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthContext'

/** Pages for content admins only (review, educators, activity log, import). Educators are sent to their own list. */
export function RequireAdmin() {
  const { isAdmin } = useAuth()
  if (!isAdmin) return <Navigate to="/activities" replace />
  return <Outlet />
}

/** Pages for super admins only (creating or disabling educators). */
export function RequireSuperAdmin() {
  const { isSuperAdmin } = useAuth()
  if (!isSuperAdmin) return <Navigate to="/" replace />
  return <Outlet />
}
