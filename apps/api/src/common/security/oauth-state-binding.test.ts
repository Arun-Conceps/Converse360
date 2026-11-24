import { describe, expect, it, vi } from 'vitest';
import {
  consumeStateNonce,
  decodeSignedState,
  encodeSignedStateWithNonce,
  nonceCookieMatches,
  oauthNonceCookieOptions,
  stateNonce,
} from './oauth-state.util';

const payload = { accountId: 'a', userId: 'u' };

describe('oauth state browser binding', () => {
  it('returns the nonce embedded in the signed state', () => {
    const { state, nonce } = encodeSignedStateWithNonce({
      payload,
      secret: 's',
    });
    expect(nonce).toBeTruthy();
    expect(stateNonce(state)).toBe(nonce);
    expect(decodeSignedState({ state, secret: 's' })).toMatchObject(payload);
  });

  it('accepts only the matching cookie', () => {
    const { state, nonce } = encodeSignedStateWithNonce({
      payload,
      secret: 's',
    });
    expect(nonceCookieMatches(state, nonce)).toBe(true);
    expect(nonceCookieMatches(state, undefined)).toBe(false);
    expect(nonceCookieMatches(state, '')).toBe(false);
    expect(nonceCookieMatches(state, nonce + 'x')).toBe(false);
    const other = encodeSignedStateWithNonce({ payload, secret: 's' });
    expect(nonceCookieMatches(state, other.nonce)).toBe(false);
  });

  it('cookie is HttpOnly + SameSite=Lax', () => {
    expect(oauthNonceCookieOptions()).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
    });
  });

  it('is single use (redis)', async () => {
    const store = {
      set: vi.fn().mockResolvedValueOnce('OK').mockResolvedValueOnce(null),
    };
    expect(await consumeStateNonce({ store, scope: 't', nonce: 'n1' })).toBe(
      true,
    );
    expect(await consumeStateNonce({ store, scope: 't', nonce: 'n1' })).toBe(
      false,
    );
  });

  it('is single use (in-memory fallback when redis errors)', async () => {
    const store = { set: vi.fn().mockRejectedValue(new Error('down')) };
    expect(await consumeStateNonce({ store, scope: 't', nonce: 'm1' })).toBe(
      true,
    );
    expect(await consumeStateNonce({ store, scope: 't', nonce: 'm1' })).toBe(
      false,
    );
  });
});
