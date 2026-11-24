import { createHash } from 'node:crypto';

/**
 * Login throttling — pure, no I/O, so it can be pinned by tests.
 *
 * In-memory and per-process: it resets on restart and is not shared between
 * replicas. That is right for the single-container deployment this panel
 * runs as; behind more than one replica the real limit belongs in the
 * reverse proxy.
 *
 * Three independent limiters, because each closes a hole the others leave:
 *  - per client IP: slows one source trying many identifiers;
 *  - per identifier (email/username): rotating IPs does not help an attacker
 *    guessing one account's password (the cost: someone can lock a known
 *    email out for the lockout window — a deliberate trade, and the
 *    break-glass login is unaffected by a staff lockout);
 *  - break-glass: the env credential is the highest-value target and has no
 *    second factor, so it gets a stricter limit and a longer lockout.
 */

export type LimitPolicy = {
  maxFailures: number;
  windowMs: number;
  lockoutMs: number;
};

export const IP_POLICY: LimitPolicy = {
  maxFailures: 10,
  windowMs: 5 * 60_000,
  lockoutMs: 5 * 60_000,
};
export const IDENTIFIER_POLICY: LimitPolicy = {
  maxFailures: 8,
  windowMs: 15 * 60_000,
  lockoutMs: 15 * 60_000,
};
export const BREAK_GLASS_POLICY: LimitPolicy = {
  maxFailures: 5,
  windowMs: 15 * 60_000,
  lockoutMs: 30 * 60_000,
};

type Entry = { failures: number[]; lockedUntil: number };

export class FailureLimiter {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly policy: LimitPolicy,
    private readonly maxKeys = 5000
  ) {}

  /** Milliseconds left on a lockout, or 0 when the key may try. */
  lockedFor(key: string, now = Date.now()): number {
    const entry = this.entries.get(key);
    if (!entry) return 0;
    return Math.max(0, entry.lockedUntil - now);
  }

  recordFailure(key: string, now = Date.now()): void {
    const entry = this.entries.get(key) ?? { failures: [], lockedUntil: 0 };
    entry.failures = entry.failures.filter(
      (at) => now - at < this.policy.windowMs
    );
    entry.failures.push(now);
    if (entry.failures.length >= this.policy.maxFailures) {
      entry.lockedUntil = now + this.policy.lockoutMs;
      entry.failures = [];
    }
    this.entries.set(key, entry);
    this.sweep(now);
  }

  reset(key: string): void {
    this.entries.delete(key);
  }

  private sweep(now: number): void {
    if (this.entries.size <= this.maxKeys) return;
    for (const [key, entry] of this.entries) {
      const idle = entry.failures.every(
        (at) => now - at >= this.policy.windowMs
      );
      if (idle && entry.lockedUntil <= now) this.entries.delete(key);
    }
  }
}

/**
 * The client address, from headers the reverse proxy controls.
 *
 * `X-Forwarded-For` is a list the CLIENT can pre-seed; behind nginx's
 * `$proxy_add_x_forwarded_for` the proxy appends the real peer to the END,
 * so the leftmost entry is attacker-chosen and only the rightmost is
 * trustworthy. `X-Real-IP` is preferred when present, but ONLY if the proxy
 * sets it unconditionally (`proxy_set_header X-Real-IP $remote_addr;`), which
 * overwrites anything the client sent. If neither is set the key is
 * 'unknown' and every anonymous caller shares one bucket — fail closed.
 */
export function clientKey(
  forwardedFor: string | null,
  realIp: string | null
): string {
  const real = realIp?.trim();
  if (real) return real;
  const parts = (forwardedFor ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts[parts.length - 1] || 'unknown';
}

export function normaliseIdentifier(identifier: string): string {
  return identifier.trim().toLowerCase();
}

/** A short, non-reversible tag for logging an identifier without storing it. */
export function identifierTag(identifier: string): string {
  return createHash('sha256')
    .update(normaliseIdentifier(identifier), 'utf8')
    .digest('hex')
    .slice(0, 12);
}

/** Enough of an address to correlate, not to identify a person. */
export function ipPrefix(ip: string): string {
  if (ip.includes(':')) return ip.split(':').slice(0, 3).join(':') + '::/48';
  const octets = ip.split('.');
  return octets.length === 4 ? `${octets.slice(0, 3).join('.')}.0/24` : ip;
}
