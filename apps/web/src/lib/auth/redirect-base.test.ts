import { describe, expect, it } from 'vitest'
import { resolveRedirectBase } from './redirect-base'

const base = {
  requestOrigin: 'http://127.0.0.1:3000',
  forwardedHost: 'evil.test',
  forwardedProto: 'https',
}

describe('resolveRedirectBase', () => {
  it('ignores an unlisted forwarded host', () => {
    expect(resolveRedirectBase(base)).toBe('http://127.0.0.1:3000')
  })
  it('prefers the configured site url', () => {
    expect(resolveRedirectBase({ ...base, siteUrl: 'https://crm.example.com/x' })).toBe(
      'https://crm.example.com',
    )
  })
  it('falls back to APP_URL', () => {
    expect(resolveRedirectBase({ ...base, appUrl: 'https://app.example.com' })).toBe(
      'https://app.example.com',
    )
  })
  it('accepts an allowlisted forwarded host', () => {
    expect(
      resolveRedirectBase({ ...base, forwardedHost: 'Crm.Example.com', allowedHosts: 'crm.example.com' }),
    ).toBe('https://crm.example.com')
  })
  it('prefers an allowlisted forwarded host over a configured site url', () => {
    expect(
      resolveRedirectBase({
        ...base,
        forwardedHost: 'app.example.com',
        allowedHosts: 'app.example.com',
        siteUrl: 'http://203.0.113.9:8091',
      }),
    ).toBe('https://app.example.com')
  })
  it('still ignores an unlisted forwarded host when a site url is set', () => {
    expect(resolveRedirectBase({ ...base, siteUrl: 'http://203.0.113.9:8091' })).toBe(
      'http://203.0.113.9:8091',
    )
  })
  it('ignores a malformed site url', () => {
    expect(resolveRedirectBase({ ...base, siteUrl: 'javascript:alert(1)' })).toBe(
      'http://127.0.0.1:3000',
    )
  })
  it('uses the request origin in development', () => {
    expect(resolveRedirectBase({ ...base, siteUrl: 'https://crm.example.com', isDevelopment: true })).toBe(
      'http://127.0.0.1:3000',
    )
  })
})
