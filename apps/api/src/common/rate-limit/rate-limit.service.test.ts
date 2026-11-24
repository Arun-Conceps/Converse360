import { describe, expect, it, vi } from 'vitest';
import type Redis from 'ioredis';
import { INCR_WITH_TTL_LUA, RateLimitService } from './rate-limit.service';

describe('RateLimitService', () => {
  it('uses a single atomic EVAL (no separate INCR/PEXPIRE)', async () => {
    const redis = {
      eval: vi.fn().mockResolvedValue([3, 40_000]),
      incr: vi.fn(),
      pexpire: vi.fn(),
    };
    const svc = new RateLimitService(redis as unknown as Redis);
    const r = await svc.check('k', { limit: 5, windowMs: 60_000 });
    expect(redis.eval).toHaveBeenCalledWith(
      INCR_WITH_TTL_LUA,
      1,
      'ratelimit:k',
      '60000',
    );
    expect(redis.incr).not.toHaveBeenCalled();
    expect(redis.pexpire).not.toHaveBeenCalled();
    expect(r).toMatchObject({ success: true, remaining: 2, limit: 5 });
  });

  it('refuses once the count passes the limit', async () => {
    const redis = { eval: vi.fn().mockResolvedValue([6, 1000]) };
    const svc = new RateLimitService(redis as unknown as Redis);
    const r = await svc.check('k', { limit: 5, windowMs: 1000 });
    expect(r.success).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it('peek does not consume a hit', async () => {
    const redis = {
      get: vi.fn().mockResolvedValue('5'),
      pttl: vi.fn().mockResolvedValue(1000),
      eval: vi.fn(),
    };
    const svc = new RateLimitService(redis as unknown as Redis);
    const r = await svc.peek('k', { limit: 5, windowMs: 1000 });
    expect(r.success).toBe(false);
    expect(redis.eval).not.toHaveBeenCalled();
  });
});
