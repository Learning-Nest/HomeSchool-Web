import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createAdminApi, type AdminApi } from '../api/admin'
import type { ApiClient } from '../api/client'
import type { User } from '../api/types'
import { isAdminRole, isStaffRole, isSuperAdminRole } from './roles'

/** Thrown by signIn when the credentials are right but the account is not platform staff. */
export class NotStaffError extends Error {
  constructor() {
    super('This account is not an educator or content administrator.')
    this.name = 'NotStaffError'
  }
}

/** Kept under the old name so existing imports keep working. */
export const NotAdminError = NotStaffError

interface AuthValue {
  user: User | null
  api: AdminApi
  /** educators write activities; admins also review, publish and manage educators. */
  isAdmin: boolean
  isSuperAdmin: boolean
  /** Signed in with a temporary password: the console only offers the "choose a new password" page. */
  mustChangePassword: boolean
  /** Why the session ended without the user asking, for the sign-in page. */
  notice: string | null
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
  changePassword(currentPassword: string, newPassword: string): Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ client, children }: { client: ApiClient; children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const restored = client.user
    // A stored session that does not belong to staff is never trusted, whatever put it there.
    if (restored && !isStaffRole(restored.platform_role)) {
      client.discard()
      return null
    }
    return restored
  })
  const [mustChangePassword, setMustChangePassword] = useState(() => client.mustChangePassword)
  const [notice, setNotice] = useState<string | null>(null)
  const api = useMemo(() => createAdminApi(client), [client])

  useEffect(
    () =>
      client.onSessionEnd((reason) => {
        setUser(null)
        setMustChangePassword(false)
        setNotice(reason === 'session_expired' ? 'Your session expired. Sign in again to continue.' : null)
      }),
    [client],
  )

  const signIn = useCallback(
    async (email: string, password: string) => {
      const out = await client.login(email, password)
      if (!isStaffRole(out.user.platform_role)) {
        // The password was right, but nothing may keep a session for a family account here.
        await client.revoke(out.refresh_token)
        throw new NotStaffError()
      }
      client.startSession(out)
      setNotice(null)
      setMustChangePassword(out.temp_login === true)
      setUser(out.user)
    },
    [client],
  )

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      await client.changePassword(currentPassword, newPassword)
      setMustChangePassword(client.mustChangePassword)
    },
    [client],
  )

  const signOut = useCallback(() => client.signOut(), [client])

  const role = user?.platform_role
  const value = useMemo<AuthValue>(
    () => ({
      user,
      api,
      isAdmin: isAdminRole(role),
      isSuperAdmin: isSuperAdminRole(role),
      mustChangePassword,
      notice,
      signIn,
      signOut,
      changePassword,
    }),
    [user, api, role, mustChangePassword, notice, signIn, signOut, changePassword],
  )
  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
