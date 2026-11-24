import { describe, expect, it } from 'vitest'
import { ASK_ADMIN_MESSAGE, friendlyApiError } from './forbidden'

describe('friendlyApiError', () => {
  it('maps 403 to the admin hint regardless of server text', () => {
    expect(friendlyApiError(403, 'Forbidden resource', 'x')).toBe(ASK_ADMIN_MESSAGE)
  })
  it('prefers the server message otherwise', () => {
    expect(friendlyApiError(400, 'Bad name', 'x')).toBe('Bad name')
  })
  it('falls back', () => {
    expect(friendlyApiError(500, undefined, 'Failed')).toBe('Failed')
  })
})
