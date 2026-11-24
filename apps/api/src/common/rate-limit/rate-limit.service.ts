import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';
import type { RateLimitOptions, RateLimitResult } from './rate-limit.types';

/**
 * Fixed-window counter backed by the self-hosted Redis instance
 * (apps/web's Upstash-REST limiter stays separate — see docker-compose.yml
 * and apps/api/.env.example). One INCR + conditional PEXPIRE per call, so a
 * key's window starts on its first hit and expires on its own.
 */
export const INCR_WITH_TTL_LUA =
  "local c = redis.call('INCR', KEYS[1]) " +
  "local t = redis.call('PTTL', KEYS[1]) " +
  "if c == 1 or t < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) t = tonumber(ARGV[1]) end " +
  'return {c, t}';

@Injectable()
export class RateLimitService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** Current state of a bucket without consuming a hit. */
  async peek(
    key: string,
    { limit }: RateLimitOptions,
  ): Promise<RateLimitResult> {
    const redisKey = `ratelimit:${key}`;
    const [raw, ttl] = await Promise.all([
      this.redis.get(redisKey),
      this.redis.pttl(redisKey),
    ]);
    const count = raw ? Number(raw) || 0 : 0;
    return {
      success: count < limit,
      remaining: Math.max(limit - count, 0),
      reset: Date.now() + Math.max(ttl, 0),
      limit,
    };
  }

  async check(
    key: string,
    { limit, windowMs }: RateLimitOptions,
  ): Promise<RateLimitResult> {
    const redisKey = `ratelimit:${key}`;
    // One atomic script: INCR and the first-hit PEXPIRE can never be split by
    // a crash, so a key can't be left without a TTL (a permanent ban).
    // The `pttl < 0` branch also heals keys orphaned by the old two-step code.
    const res = (await this.redis.eval(
      INCR_WITH_TTL_LUA,
      1,
      redisKey,
      String(windowMs),
    )) as [number, number];
    const count = Number(res[0]);
    const ttl = Number(res[1]);
    const reset = Date.now() + Math.max(ttl, 0);

    return {
      success: count <= limit,
      remaining: Math.max(limit - count, 0),
      reset,
      limit,
    };
  }
}
