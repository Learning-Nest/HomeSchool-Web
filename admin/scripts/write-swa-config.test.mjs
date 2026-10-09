import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { apiOrigin, renderConfig } from './write-swa-config.mjs'

const template = JSON.stringify({
  globalHeaders: { 'Content-Security-Policy': "default-src 'self'; connect-src 'self' __API_ORIGIN__; object-src 'none'" },
})

describe('write-swa-config', () => {
  it('puts the API origin into connect-src', () => {
    const out = JSON.parse(renderConfig(template, 'https://api.example.com'))
    expect(out.globalHeaders['Content-Security-Policy']).toContain("connect-src 'self' https://api.example.com;")
    expect(JSON.stringify(out)).not.toContain('__API_ORIGIN__')
  })

  it('keeps only the origin when the base URL has a path or a trailing slash', () => {
    expect(apiOrigin('https://api.example.com/v1/')).toBe('https://api.example.com')
    expect(apiOrigin('http://localhost:8000')).toBe('http://localhost:8000')
  })

  it('rejects an empty, malformed or non-http URL instead of writing a broken policy', () => {
    expect(() => apiOrigin('')).toThrow(/not a valid URL/)
    expect(() => apiOrigin('ftp://files.example.com')).toThrow(/http\(s\)/)
    expect(() => renderConfig('{}', 'https://api.example.com')).toThrow(/placeholder/)
  })

  it('lets the shipped policy load activity pictures from Azure Blob Storage and from the API itself', () => {
    const real = readFileSync(resolve(process.cwd(), 'public/staticwebapp.config.json'), 'utf8')
    const csp = JSON.parse(renderConfig(real, 'https://api.example.com')).globalHeaders['Content-Security-Policy']
    const imgSrc = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('img-src'))
    expect(imgSrc).toContain('https://*.blob.core.windows.net')
    expect(imgSrc).toContain('https://api.example.com')
    expect(imgSrc).toContain("'self'")
    expect(csp).toContain("script-src 'self'")
  })
})
