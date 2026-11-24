import { createHmac, timingSafeEqual } from 'node:crypto';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';
import type { RateLimitService } from '../common/rate-limit/rate-limit.service';

/**
 * Redirect targets (H-10).
 *
 * `settings.redirect_url` is customer-authored and is later assigned to
 * `window.location.href` on a PUBLIC page. `javascript:alert(1)` there is
 * stored XSS against every visitor, and only a browser <input type=url>
 * ever checked it. Allow absolute http(s) URLs and nothing else.
 */
export const MAX_REDIRECT_URL_LENGTH = 2048;

/** The normalised URL, or null when it is not a safe absolute http(s) URL. */
export function safeRedirectUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // Browsers strip tab/CR/LF anywhere in a URL and trim C0/space at the
  // ends, so "java\nscript:" is a javascript: URL to them. Refuse anything
  // containing such characters rather than reasoning about it.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000- \u007f]/.test(value)) return null;
  if (value.length === 0 || value.length > MAX_REDIRECT_URL_LENGTH) return null;
  // Must literally begin with the scheme: rules out `//evil.test`, `/x`.
  if (!/^https?:\/\//i.test(value)) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (!parsed.hostname) return null;
  // A credential in a redirect target is a phishing aid.
  if (parsed.username || parsed.password) return null;
  return parsed.toString();
}

/**
 * Normalise a redirect_url on its way into storage. null/''/undefined mean
 * "none"; anything else must be safe or the save is rejected.
 */
export function parseRedirectUrlForSave(
  value: unknown,
): { ok: true; value: string | null } | { ok: false } {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value === 'string' && value.trim() === '') {
    return { ok: true, value: null };
  }
  const safe = safeRedirectUrl(value);
  return safe ? { ok: true, value: safe } : { ok: false };
}

// ---------------------------------------------------------------------------
// Rate limiting (H-7)
// ---------------------------------------------------------------------------

/**
 * The caller's address as Express resolved it.
 *
 * `req.ip` only reflects X-Forwarded-For when `trust proxy` is configured;
 * without it, behind a reverse proxy, every visitor shares the proxy's
 * address and the per-IP buckets become one global bucket. We deliberately
 * do NOT read the header ourselves: it is client-settable, so trusting it
 * lets an attacker mint a fresh bucket per request.
 */
export function requestIp(req: Pick<Request, 'ip' | 'socket'>): string {
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

export async function enforceRateLimit(
  rateLimit: Pick<RateLimitService, 'check'>,
  key: string,
  limit: number,
  windowMs = 60_000,
): Promise<void> {
  const result = await rateLimit.check(key, { limit, windowMs });
  if (!result.success) {
    throw new HttpException(
      'Too many requests — please slow down and try again shortly.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

// ---------------------------------------------------------------------------
// Server-issued render timestamp (H-7)
// ---------------------------------------------------------------------------

const TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function tokenSecret(): string | null {
  return (
    process.env.FORM_SPAM_TOKEN_SECRET ??
    process.env.WEB_IP_HASH_SALT ??
    process.env.ENCRYPTION_KEY ??
    null
  );
}

function tokenMac(secret: string, formId: string, issuedAt: number): string {
  return createHmac('sha256', secret)
    .update(`form-render:${formId}:${issuedAt}`)
    .digest('hex');
}

/** `<issuedAtMs>.<hmac>`, or null when no server secret is configured. */
export function issueRenderToken(
  formId: string,
  now = Date.now(),
): string | null {
  const secret = tokenSecret();
  if (!secret) return null;
  return `${now}.${tokenMac(secret, formId, now)}`;
}

export type RenderTokenCheck =
  | { status: 'valid'; elapsedMs: number }
  | { status: 'absent' }
  | { status: 'invalid' };

export function checkRenderToken(
  formId: string,
  token: unknown,
  now = Date.now(),
): RenderTokenCheck {
  if (token === undefined || token === null || token === '') {
    return { status: 'absent' };
  }
  const secret = tokenSecret();
  if (typeof token !== 'string' || !secret) return { status: 'invalid' };
  const m = /^(\d{10,16})\.([0-9a-f]{64})$/.exec(token);
  if (!m) return { status: 'invalid' };
  const issuedAt = Number(m[1]);
  const expected = Buffer.from(tokenMac(secret, formId, issuedAt), 'hex');
  const given = Buffer.from(m[2], 'hex');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { status: 'invalid' };
  }
  const elapsedMs = now - issuedAt;
  if (elapsedMs < 0 || elapsedMs > TOKEN_MAX_AGE_MS) {
    return { status: 'invalid' };
  }
  return { status: 'valid', elapsedMs };
}

// ---------------------------------------------------------------------------
// Payload bounds (H-7)
// ---------------------------------------------------------------------------

export const MAX_SUBMIT_BYTES = 100 * 1024;

export function payloadBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/** Shallow string map with caps; anything else is dropped. */
export function sanitiseUtm(utm: unknown): Record<string, string> | undefined {
  if (!utm || typeof utm !== 'object' || Array.isArray(utm)) return undefined;
  const out: Record<string, string> = {};
  let n = 0;
  for (const [k, v] of Object.entries(utm as Record<string, unknown>)) {
    if (n >= 10) break;
    if (typeof v !== 'string' || k.length > 64) continue;
    out[k] = v.slice(0, 256);
    n++;
  }
  return n ? out : undefined;
}
