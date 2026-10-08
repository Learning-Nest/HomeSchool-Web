import { describe, expect, it } from 'vitest'
import { injectMeta, metaPolicy } from './write-pages-csp.mjs'

const rendered = JSON.stringify({
  globalHeaders: {
    'Content-Security-Policy': "default-src 'self'; connect-src 'self' https://api.example.com; frame-ancestors 'none'",
  },
})

describe('write-pages-csp', () => {
  it('keeps the policy but drops frame-ancestors, which a meta tag cannot carry', () => {
    const policy = metaPolicy(rendered)
    expect(policy).toBe("default-src 'self'; connect-src 'self' https://api.example.com")
  })

  it('fails when the config has no policy', () => {
    expect(() => metaPolicy('{}')).toThrow(/Content-Security-Policy/)
  })

  it('inserts the tag right after <head> and refuses to do it twice', () => {
    const html = '<!doctype html><html><head><title>x</title></head><body></body></html>'
    const out = injectMeta(html, "default-src 'self'")
    expect(out).toContain('<head>\n    <meta http-equiv="Content-Security-Policy" content="default-src \'self\'" />')
    expect(() => injectMeta(out, "default-src 'self'")).toThrow(/already/)
  })

  it('refuses a page without a head', () => {
    expect(() => injectMeta('<html></html>', "default-src 'self'")).toThrow(/head/)
  })
})
