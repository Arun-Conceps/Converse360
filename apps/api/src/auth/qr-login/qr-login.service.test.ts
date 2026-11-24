import { describe, expect, it, vi } from 'vitest';
import { QrLoginService } from './qr-login.service';

function make() {
  const hset = vi.fn().mockReturnThis();
  const multi = { hset, expire: vi.fn().mockReturnThis(), exec: vi.fn() };
  const redis = { multi: () => multi, hgetall: vi.fn() };
  const limiter = { check: vi.fn().mockResolvedValue({ success: true }) };
  const svc = new QrLoginService(redis as never, limiter as never);
  return { svc, hset, redis, limiter };
}

describe('QrLoginService origin', () => {
  it('stores initiator ip and user-agent, TTL at most 2 minutes', async () => {
    const { svc, hset } = make();
    const out = await svc.start('9.9.9.9', 'Mozilla/5.0 test');
    expect(out.expiresIn).toBeLessThanOrEqual(120);
    expect(hset.mock.calls[0][1]).toMatchObject({
      ip: '9.9.9.9',
      ua: 'Mozilla/5.0 test',
    });
  });

  it('peek returns the origin for a matching secret', async () => {
    const { svc, hset, redis } = make();
    const { id, secret } = await svc.start('9.9.9.9', 'UA');
    redis.hgetall.mockResolvedValue(
      hset.mock.calls[0][1] as Record<string, string>,
    );
    const o = await svc.peek('user-1', id, secret);
    expect(o).toMatchObject({ ip: '9.9.9.9', userAgent: 'UA' });
  });

  it('peek rejects a wrong secret', async () => {
    const { svc, hset, redis } = make();
    const { id } = await svc.start('1.1.1.1', 'UA');
    redis.hgetall.mockResolvedValue(
      hset.mock.calls[0][1] as Record<string, string>,
    );
    await expect(svc.peek('u', id, 'a'.repeat(64))).rejects.toThrow();
  });
});
