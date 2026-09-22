export interface AppConfig {
  apiBaseUrl: string
  envName: string
  /** Set when the build was made without a usable API URL; the app shows it instead of starting. */
  error: string | null
}

export function normaliseBaseUrl(raw: string | undefined): string {
  const value = (raw ?? '').trim()
  if (!value) throw new Error('VITE_API_BASE_URL is not set.')
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`VITE_API_BASE_URL is not a valid URL: ${value}`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('VITE_API_BASE_URL must start with http:// or https://')
  }
  return value.replace(/\/+$/, '')
}

/** "dev" and "nonprod" get a visible badge; production shows none. */
export function envBadgeLabel(envName: string): string | null {
  const name = envName.trim().toLowerCase()
  if (name === 'dev') return 'DEV'
  if (name === 'nonprod') return 'NONPROD'
  return null
}

export function readConfig(env: { VITE_API_BASE_URL?: string; VITE_ENV_NAME?: string }): AppConfig {
  const envName = (env.VITE_ENV_NAME ?? '').trim().toLowerCase()
  try {
    return { apiBaseUrl: normaliseBaseUrl(env.VITE_API_BASE_URL), envName, error: null }
  } catch (e) {
    return { apiBaseUrl: '', envName, error: e instanceof Error ? e.message : String(e) }
  }
}

export const config = readConfig(import.meta.env)
