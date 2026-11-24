import crypto from 'node:crypto';

/**
 * Signed, self-contained OAuth `state` for any provider redirect flow.
 *
 * Extracted from instagram/utils/oauth-state.util.ts (which re-exports
 * a pre-bound wrapper, so existing imports are unaffected) when the Ads
 * Manager landed and needed the identical mechanism signed with a
 * different app secret. Same move as common/messaging/meta-errors.ts.
 *
 * WHY SIGNED RATHER THAN A DB ROW
 *   The state has to survive a round trip through a provider's consent
 *   screen and come back on a GET that carries no session cookie we can
 *   rely on (it is a top-level cross-site navigation). Storing a nonce
 *   row would work but adds a table, a TTL sweep and a read on a hot
 *   path. An HMAC over {accountId, userId, nonce, expiry} gives the
 *   same two guarantees — the callback is for a real request we
 *   started, and it is bound to the account that started it — with no
 *   storage.
 *
 * WHAT IT DEFENDS AGAINST
 *   Without account binding, an attacker could start a connect flow,
 *   capture the redirect, and feed the callback URL to a victim who is
 *   logged into a different tenant — attaching the attacker's provider
 *   account to the victim's CRM, or the reverse. Carrying the accountId
 *   inside the signed blob means the callback can only ever write to
 *   the account that initiated it.
 *
 *   For the Ads Manager the stakes are higher than for a channel
 *   connect: the account being attached can spend money.
 */

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes: a consent dialog, not a session

export interface OAuthStatePayload {
  accountId: string;
  userId: string;
  /** Where to send the browser once the callback completes. */
  returnTo?: string;
}

interface SignedState extends OAuthStatePayload {
  nonce: string;
  exp: number;
}

function sign(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('base64url');
}

export function encodeSignedState<P extends OAuthStatePayload>(args: {
  payload: P;
  secret: string;
}): string {
  const signed: SignedState = {
    ...args.payload,
    nonce: crypto.randomBytes(16).toString('base64url'),
    exp: Date.now() + STATE_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(signed)).toString('base64url');
  return `${body}.${sign(body, args.secret)}`;
}

/**
 * Returns the payload, or null for anything that fails to verify:
 * malformed, tampered, or expired. Callers must treat null as "abort
 * the connect flow" — never as "proceed with defaults".
 *
 * PROVIDER-SPECIFIC FIELDS SURVIVE THE ROUND TRIP. The generic `P` and
 * the spread below exist because the app-connections flow carries a
 * `provider` and a PKCE `codeVerifier` in the same blob; an earlier
 * version rebuilt the return value field-by-field and silently dropped
 * anything it did not know about, which looks exactly like a tampered
 * state at the call site. `nonce` and `exp` are stripped — they are
 * mechanism, not payload.
 *
 * ⚠️ A passing HMAC proves WE minted the blob, not that the blob is
 * complete. Bindings that add fields must check their own for presence,
 * as this function does for accountId/userId.
 */
export function decodeSignedState<P extends OAuthStatePayload>(args: {
  state: string;
  secret: string;
}): P | null {
  const { state, secret } = args;
  const dot = state.lastIndexOf('.');
  if (dot <= 0) return null;

  const body = state.slice(0, dot);
  const signature = state.slice(dot + 1);

  let expected: string;
  try {
    expected = sign(body, secret);
  } catch {
    return null; // secret missing/unusable — fail closed
  }

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;

  let parsed: Partial<SignedState> & Record<string, unknown>;
  try {
    // Cast, not trust: this is attacker-reachable input that merely
    // passed an HMAC check. The field checks below are what actually
    // validate it — `Partial` keeps the compiler honest about that.
    parsed = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as Partial<SignedState> & Record<string, unknown>;
  } catch {
    return null;
  }

  if (typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return null;
  if (!parsed.accountId || !parsed.userId) return null;

  const { nonce: _nonce, exp: _exp, ...payload } = parsed;
  return {
    ...payload,
    accountId: parsed.accountId,
    userId: parsed.userId,
    returnTo: parsed.returnTo,
  } as P;
}

// ------------------------------------------------------------------
// Browser binding + single use
// ------------------------------------------------------------------
//
// A passing HMAC proves WE minted the state. It does not prove the
// browser presenting it is the one that started the flow, nor that it is
// the first time it is presented -- so an attacker could start a connect
// flow with their own provider account, then trick a logged-in victim
// into loading the callback URL ("login CSRF"), attaching the attacker's
// account to the victim's workspace. Two extra checks close that:
//
//   1. The flow-start response sets a short-lived HttpOnly, SameSite=Lax
//      cookie holding the state's nonce; the callback must present the
//      matching cookie. The attacker cannot set a cookie in the victim's
//      browser, so their captured callback URL fails.
//   2. The nonce is single use (Redis SET NX with TTL, in-memory fallback).

export const OAUTH_NONCE_TTL_MS = STATE_TTL_MS;

/** Reads the nonce out of a state. Only call after decodeSignedState passed. */
export function stateNonce(state: string): string | null {
  const dot = state.lastIndexOf('.');
  if (dot <= 0) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(state.slice(0, dot), 'base64url').toString('utf8'),
    ) as { nonce?: unknown };
    return typeof parsed.nonce === 'string' && parsed.nonce
      ? parsed.nonce
      : null;
  } catch {
    return null;
  }
}

/** Like encodeSignedState, but also hands back the nonce for the cookie. */
export function encodeSignedStateWithNonce<P extends OAuthStatePayload>(args: {
  payload: P;
  secret: string;
}): { state: string; nonce: string } {
  const state = encodeSignedState(args);
  return { state, nonce: stateNonce(state) as string };
}

/** Cookie attributes for the nonce cookie set when a connect flow starts. */
export function oauthNonceCookieOptions(): {
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  maxAge: number;
  path: string;
} {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: OAUTH_NONCE_TTL_MS,
    path: '/',
  };
}

/** Constant-time check that the presented cookie is this state's nonce. */
export function nonceCookieMatches(
  state: string,
  cookieValue: string | undefined | null,
): boolean {
  const nonce = stateNonce(state);
  if (!nonce || typeof cookieValue !== 'string' || !cookieValue) return false;
  const a = Buffer.from(cookieValue);
  const b = Buffer.from(nonce);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const usedNonces = new Map<string, number>();

/** Minimal slice of ioredis used here. */
export interface NonceStore {
  set(
    key: string,
    value: string,
    mode: 'PX',
    ttl: number,
    nx: 'NX',
  ): Promise<'OK' | null>;
}

/**
 * Marks a nonce used. Returns true the FIRST time, false on replay.
 * Redis is shared across instances; if it errors we fall back to a
 * per-process set rather than blocking every connect.
 */
export async function consumeStateNonce(args: {
  store?: NonceStore | null;
  scope: string;
  nonce: string;
}): Promise<boolean> {
  const key = `oauth-state-used:${args.scope}:${args.nonce}`;
  if (args.store) {
    try {
      const r = await args.store.set(
        key,
        '1',
        'PX',
        OAUTH_NONCE_TTL_MS + 60_000,
        'NX',
      );
      return r === 'OK';
    } catch {
      // fall through to the in-memory set
    }
  }
  const now = Date.now();
  for (const [k, exp] of usedNonces) if (exp < now) usedNonces.delete(k);
  if (usedNonces.has(key)) return false;
  usedNonces.set(key, now + OAUTH_NONCE_TTL_MS + 60_000);
  return true;
}
