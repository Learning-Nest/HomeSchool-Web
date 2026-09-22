import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { EnvBadge } from './EnvBadge'

export function Layout() {
  const { user, signOut } = useAuth()
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
          <span className="brand">HomeSchooling Admin</span>
          <EnvBadge />
          <nav aria-label="Main" className="nav">
            <NavLink to="/" end>
              Dashboard
            </NavLink>
            <NavLink to="/activities">Activities</NavLink>
            <NavLink to="/import">Import</NavLink>
          </nav>
          <div className="account">
            <span className="account-email" title={user?.email}>
              {user?.email}
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
