import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time comparison of a presented shared secret against the
 * configured one. An unset/empty expected secret never matches, and
 * differing lengths are rejected up front (`timingSafeEqual` throws on
 * them).
 */
export function secretMatches(
  presented: string | undefined | null,
  expected: string | undefined | null,
): boolean {
  if (!presented || !expected) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
