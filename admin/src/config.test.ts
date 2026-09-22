import { describe, expect, it } from 'vitest'
import { envBadgeLabel, normaliseBaseUrl, readConfig } from './config'

describe('config', () => {
  it('trims trailing slashes from the API base URL', () => {
    expect(normaliseBaseUrl(' https://api.example.com/// ')).toBe('https://api.example.com')
    expect(normaliseBaseUrl('http://localhost:8000')).toBe('http://localhost:8000')
  })

  it('rejects a missing or malformed API base URL', () => {
    expect(() => normaliseBaseUrl(undefined)).toThrow(/not set/)
    expect(() => normaliseBaseUrl('api.example.com')).toThrow(/not a valid URL/)
    expect(() => normaliseBaseUrl('javascript:alert(1)')).toThrow(/http/)
  })

  it('shows a badge for dev and nonprod only', () => {
    expect(envBadgeLabel('dev')).toBe('DEV')
    expect(envBadgeLabel('NonProd')).toBe('NONPROD')
    expect(envBadgeLabel('prod')).toBeNull()
    expect(envBadgeLabel('')).toBeNull()
  })

  it('turns a bad environment into a visible config error instead of throwing at import time', () => {
    expect(readConfig({ VITE_ENV_NAME: 'prod' })).toMatchObject({ apiBaseUrl: '', error: expect.stringContaining('not set') })
    expect(readConfig({ VITE_API_BASE_URL: 'https://api.example.com/', VITE_ENV_NAME: 'Dev' })).toEqual({
      apiBaseUrl: 'https://api.example.com',
      envName: 'dev',
      error: null,
    })
  })
})
