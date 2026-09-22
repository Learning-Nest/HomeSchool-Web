import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createAdminApi, type AdminApi } from '../api/admin'
import type { ApiClient } from '../api/client'
import type { User } from '../api/types'
import { isAdminRole } from './roles'

/** Thrown by signIn when the credentials are right but the account is not platform staff. */
export class NotAdminError extends Error {
  constructor() {
    super('This account is not a content administrator.')
    this.name = 'NotAdminError'
  }
}

interface AuthValue {
  user: User | null
  api: AdminApi
  /** Why the session ended without the user asking, for the sign-in page. */
  notice: string | null
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ client, children }: { client: ApiClient; children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const restored = client.user
    // A stored session that does not belong to staff is never trusted, whatever put it there.
    if (restored && !isAdminRole(restored.platform_role)) {
      client.discard()
      return null
    }
    return restored
  })
  const [notice, setNotice] = useState<string | null>(null)
  const api = useMemo(() => createAdminApi(client), [client])

  useEffect(
    () =>
      client.onSessionEnd((reason) => {
        setUser(null)
        setNotice(reason === 'session_expired' ? 'Your session expired. Sign in again to continue.' : null)
      }),
    [client],
  )

  const signIn = useCallback(
    async (email: string, password: string) => {
      const out = await client.login(email, password)
      if (!isAdminRole(out.user.platform_role)) {
        // The password was right, but nothing may keep a session for a family account here.
        await client.revoke(out.refresh_token)
        throw new NotAdminError()
      }
      client.startSession(out)
      setNotice(null)
      setUser(out.user)
    },
    [client],
  )

  const signOut = useCallback(() => client.signOut(), [client])

  const value = useMemo<AuthValue>(
    () => ({ user, api, notice, signIn, signOut }),
    [user, api, notice, signIn, signOut],
  )
  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
