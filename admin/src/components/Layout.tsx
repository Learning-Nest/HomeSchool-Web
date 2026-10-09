import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { EnvBadge } from './EnvBadge'

function roleLabel(role: string | null | undefined): string {
  if (role === 'super_admin') return 'Super admin'
  if (role === 'content_admin') return 'Content admin'
  if (role === 'educator') return 'Educator'
  return ''
}

export function Layout() {
  const { user, signOut, isAdmin } = useAuth()
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const firstRender = useRef(true)
  const [signingOut, setSigningOut] = useState(false)

  // Screen-reader and keyboard users land on the new page's content after in-app navigation.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    mainRef.current?.focus()
  }, [location.pathname])

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="app-header">
        <div className="app-header-inner">
          <span className="brand">HomeSchooling Content</span>
          <EnvBadge />
          <nav aria-label="Main" className="nav">
            {isAdmin && (
              <NavLink to="/" end>
                Dashboard
              </NavLink>
            )}
            <NavLink to="/activities" end>
              {isAdmin ? 'Activities' : 'My activities'}
            </NavLink>
            <NavLink to="/activities/new">New activity</NavLink>
            {isAdmin && <NavLink to="/review">Review</NavLink>}
            {isAdmin && <NavLink to="/educators">Educators</NavLink>}
            {isAdmin && <NavLink to="/activity-log">Activity log</NavLink>}
            {isAdmin && <NavLink to="/import">Import</NavLink>}
          </nav>
          <div className="account">
            <span className="account-email" title={user?.email}>
              {user?.email}
              <span className="account-role">{roleLabel(user?.platform_role)}</span>
            </span>
            <button type="button" className="btn btn-small" onClick={handleSignOut} disabled={signingOut}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main id="main" ref={mainRef} tabIndex={-1} className="app-main">
        <Outlet />
      </main>
    </>
  )
}
