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
