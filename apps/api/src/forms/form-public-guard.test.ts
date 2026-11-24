import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkRenderToken,
  enforceRateLimit,
  issueRenderToken,
  parseRedirectUrlForSave,
  payloadBytes,
  safeRedirectUrl,
  sanitiseUtm,
} from './form-public-guard';

describe('safeRedirectUrl', () => {
  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    '  javascript:alert(1)',
    '\n\tjavascript:alert(1)',
    'java\nscript:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    '//evil.test/x',
    '/relative',
    'ftp://x.test',
    'https://user:pw@evil.test',
    'https://',
    'http://a.test/' + 'a'.repeat(3000),
    '',
    'https://ok.test/ a',
  ])('rejects %j', (v) => {
    expect(safeRedirectUrl(v)).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(safeRedirectUrl(5)).toBeNull();
    expect(safeRedirectUrl({})).toBeNull();
  });

  it('accepts http and https', () => {
    expect(safeRedirectUrl('https://example.com/thanks?a=1')).toBe(
      'https://example.com/thanks?a=1',
    );
    expect(safeRedirectUrl('HTTP://example.com')).toBe('http://example.com/');
  });

  it('save: empty is none, hostile is rejected', () => {
    expect(parseRedirectUrlForSave(null)).toEqual({ ok: true, value: null });
    expect(parseRedirectUrlForSave('  ')).toEqual({ ok: true, value: null });
    expect(parseRedirectUrlForSave('javascript:1')).toEqual({ ok: false });
  });
});

describe('render token', () => {
  beforeEach(() => {
    process.env.FORM_SPAM_TOKEN_SECRET = 'test-secret';
  });

  it('round-trips and reports elapsed', () => {
    const t = issueRenderToken('f1', 1_700_000_000_000)!;
    expect(checkRenderToken('f1', t, 1_700_000_005_000)).toEqual({
      status: 'valid',
      elapsedMs: 5000,
    });
  });

  it('rejects other form, tampering, future and expired', () => {
    const t = issueRenderToken('f1', 1_700_000_000_000)!;
    expect(checkRenderToken('f2', t, 1_700_000_005_000).status).toBe('invalid');
    expect(
      checkRenderToken('f1', t.replace('1700000000000', '1600000000000'))
        .status,
    ).toBe('invalid');
    expect(checkRenderToken('f1', t, 1_699_999_999_000).status).toBe('invalid');
    expect(
      checkRenderToken('f1', t, 1_700_000_000_000 + 25 * 3600e3).status,
    ).toBe('invalid');
    expect(checkRenderToken('f1', 'garbage').status).toBe('invalid');
  });

  it('absent when missing', () => {
    expect(checkRenderToken('f1', undefined)).toEqual({ status: 'absent' });
  });
});

describe('enforceRateLimit', () => {
  it('throws 429 past the limit', async () => {
    const rl = { check: vi.fn().mockResolvedValue({ success: false }) };
    await expect(enforceRateLimit(rl, 'k', 1)).rejects.toMatchObject({
      status: 429,
    });
    rl.check.mockResolvedValue({ success: true });
    await expect(enforceRateLimit(rl, 'k', 1)).resolves.toBeUndefined();
  });
});

describe('bounds', () => {
  it('measures payload and shapes utm', () => {
    expect(payloadBytes({ a: 'x'.repeat(200_000) })).toBeGreaterThan(
      100 * 1024,
    );
    expect(sanitiseUtm({ a: 'b', c: { d: 1 }, e: 5 })).toEqual({ a: 'b' });
    expect(sanitiseUtm('x')).toBeUndefined();
  });
});
