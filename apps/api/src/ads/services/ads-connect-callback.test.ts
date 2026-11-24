import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdsConnectService } from './ads-connect.service';

describe('AdsConnectService OAuth callback binding', () => {
  let svc: AdsConnectService;
  const redis = { set: vi.fn() };

  beforeEach(() => {
    process.env.META_ADS_APP_ID = 'app';
    process.env.META_ADS_APP_SECRET = 'secret';
    process.env.META_ADS_REDIRECT_URI = 'https://api.test/ads/oauth/callback';
    redis.set.mockReset().mockResolvedValue('OK');
    svc = new AdsConnectService({} as never, {} as never, redis);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, text: async () => 'nope' }),
    );
  });

  const start = () =>
    svc.startAuthorize({ accountId: 'acc', userId: 'u' });
  const stateOf = (url: string) =>
    new URL(url).searchParams.get('state') as string;

  it('rejects a callback with no nonce cookie (login CSRF)', async () => {
    const { url } = start();
    await expect(
      svc.handleCallback({ code: 'c', state: stateOf(url) }),
    ).rejects.toThrow(/not started in this browser/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects a cookie belonging to a different flow', async () => {
    const a = start();
    const b = start();
    await expect(
      svc.handleCallback({
        code: 'c',
        state: stateOf(a.url),
        nonceCookie: b.nonce,
      }),
    ).rejects.toThrow(/not started in this browser/);
  });

  it('proceeds with the matching cookie, then refuses a replay', async () => {
    const { url, nonce } = start();
    redis.set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);
    // Passes the binding, then fails at the (stubbed) code exchange.
    await expect(
      svc.handleCallback({
        code: 'c',
        state: stateOf(url),
        nonceCookie: nonce,
      }),
    ).rejects.toThrow(/Facebook rejected/);
    await expect(
      svc.handleCallback({
        code: 'c',
        state: stateOf(url),
        nonceCookie: nonce,
      }),
    ).rejects.toThrow(/already been used/);
  });
});
