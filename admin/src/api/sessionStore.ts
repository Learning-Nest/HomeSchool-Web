import type { User } from './types'

export interface Tokens {
  accessToken: string
  refreshToken: string
  /** Epoch milliseconds. */
  accessExpiresAt: number
}

export interface StoredSession {
  tokens: Tokens
  user: User
}

export interface SessionStore {
  load(): StoredSession | null
  save(session: StoredSession): void
  clear(): void
}

const KEY = 'hs-admin-session'

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== 'object' || value === null) return false
  const { tokens, user } = value as Partial<StoredSession>
  return (
    typeof tokens?.accessToken === 'string' &&
    typeof tokens.refreshToken === 'string' &&
    typeof tokens.accessExpiresAt === 'number' &&
    typeof user?.email === 'string'
  )
}

/**
 * sessionStorage keeps a reload from signing the editor out but dies with the tab. Never localStorage:
 * it outlives the tab and is shared by every tab of the origin. Storage can throw (blocked, private mode),
 * in which case the session simply lives in memory.
 */
export const sessionStorageStore: SessionStore = {
  load() {
    try {
      const raw = sessionStorage.getItem(KEY)
      const parsed: unknown = raw ? JSON.parse(raw) : null
      return isStoredSession(parsed) ? parsed : null
    } catch {
      return null
    }
  },
  save(session) {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(session))
    } catch {
      /* memory only */
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(KEY)
    } catch {
      /* nothing to clear */
    }
  },
}

export function memoryStore(initial: StoredSession | null = null): SessionStore {
  let current = initial
  return {
    load: () => current,
    save: (s) => {
      current = s
    },
    clear: () => {
      current = null
    },
  }
}
