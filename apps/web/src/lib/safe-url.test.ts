import { describe, expect, it } from 'vitest'
import { safeHttpUrl } from './safe-url'

describe('safeHttpUrl', () => {
  it.each(['https://a.test/x?y=1', 'http://a.test', '/api/media/1'])('allows %s', (u) => {
    expect(safeHttpUrl(u)).toBe(u)
  })
  it.each([
    'javascript:alert(1)',
    ' JaVaScRiPt:alert(1)',
    'java\nscript:alert(1)',
    'data:text/html,x',
    'vbscript:x',
    '//evil.test/x',
    '/' + String.fromCharCode(92) + 'evil.test',
    'not a url',
    '',
    null,
    undefined,
    42,
  ])('rejects %s', (u) => {
    expect(safeHttpUrl(u)).toBeUndefined()
  })
})
