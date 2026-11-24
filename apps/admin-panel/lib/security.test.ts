import { describe, expect, it } from 'vitest';

import {
  BREAK_GLASS_POLICY,
  FailureLimiter,
  clientKey,
  identifierTag,
  ipPrefix,
} from '@/lib/auth-throttle';
import { breakGlassVersion } from '@/lib/session-version';
import { pickFromAlphabet } from '@/lib/staff/password';

describe('clientKey', () => {
  it('prefers X-Real-IP', () => {
    expect(clientKey('1.1.1.1, 2.2.2.2', '9.9.9.9')).toBe('9.9.9.9');
  });
  it('uses the RIGHTMOST forwarded entry, not the client-supplied leftmost', () => {
    expect(clientKey('6.6.6.6, 203.0.113.5', null)).toBe('203.0.113.5');
  });
  it('falls back to a shared bucket', () => {
    expect(clientKey(null, null)).toBe('unknown');
  });
});

describe('FailureLimiter', () => {
  const policy = { maxFailures: 3, windowMs: 1000, lockoutMs: 5000 };
  it('locks after max failures and releases after the lockout', () => {
    const l = new FailureLimiter(policy);
    for (let i = 0; i < 3; i++) l.recordFailure('a', 0);
    expect(l.lockedFor('a', 100)).toBeGreaterThan(0);
    expect(l.lockedFor('a', 5001)).toBe(0);
    expect(l.lockedFor('b', 100)).toBe(0);
  });
  it('forgets failures outside the window', () => {
    const l = new FailureLimiter(policy);
    l.recordFailure('a', 0);
    l.recordFailure('a', 10);
    l.recordFailure('a', 5000);
    expect(l.lockedFor('a', 5001)).toBe(0);
  });
  it('reset clears a key; break-glass policy is stricter than 10', () => {
    const l = new FailureLimiter(policy);
    for (let i = 0; i < 3; i++) l.recordFailure('a', 0);
    l.reset('a');
    expect(l.lockedFor('a', 1)).toBe(0);
    expect(BREAK_GLASS_POLICY.maxFailures).toBeLessThan(10);
  });
});

describe('audit tags', () => {
  it('never contains the identifier and is case-insensitive', () => {
    expect(identifierTag('Admin@X.com')).toBe(identifierTag(' admin@x.com'));
    expect(identifierTag('admin@x.com')).not.toContain('admin');
    expect(ipPrefix('203.0.113.77')).toBe('203.0.113.0/24');
  });
});

describe('breakGlassVersion', () => {
  it('changes when the credential or the env version changes', () => {
    const base = breakGlassVersion('root', 'pw', '');
    expect(breakGlassVersion('root', 'pw', '')).toBe(base);
    expect(breakGlassVersion('root', 'pw2', '')).not.toBe(base);
    expect(breakGlassVersion('root', 'pw', '2')).not.toBe(base);
    expect(Number.isSafeInteger(base)).toBe(true);
  });
});

describe('pickFromAlphabet', () => {
  it('rejects biased bytes and stays uniform over the alphabet', () => {
    const alphabet = 'abc'; // limit = 255
    // 255 is rejected; without rejection it would map to 'a'.
    const out = pickFromAlphabet(alphabet, 2, () => Uint8Array.from([255, 255, 0, 1]));
    expect(out).toBe('ab');
  });
  it('produces the requested length from real randomness', () => {
    expect(pickFromAlphabet('ABCDEFGH', 20)).toMatch(/^[A-H]{20}$/);
  });
});
