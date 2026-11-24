import { UnauthorizedException } from '@nestjs/common';
import { createServerClient } from '@supabase/ssr';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Request } from 'express';

/**
 * Verifying a dashboard caller's identity, in one place.
 *
 * Extracted from SupabaseAuthGuard when SupabaseUserGuard needed the same
 * thing without the workspace resolution that follows it. Two copies of token
 * verification is how one of them ends up skipping a check — and there was
 * already precedent: `POST /invitations/:token/redeem` did its own auth by
 * testing whether the Authorization header *started with* "Bearer ", which
 * accepts the literal string "Bearer x".
 */

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
    );
  }
  return jwks;
}

/**
 * Returns the verified `sub` of the session in this request's cookies, or
 * throws UnauthorizedException.
 *
 * The Next.js rewrite (apps/web/next.config.ts) forwards the original `Cookie`
 * header same-origin, so this only ever sees an already-fresh access token —
 * refresh and rotation stay owned by apps/web's proxy.
 */
export async function verifySupabaseSession(
  request: Pick<Request, 'cookies' | 'headers'>,
): Promise<string> {
  // The mobile app has no cookie jar: it sends its Supabase access token as a
  // Bearer header. Strict match — an `startsWith('Bearer ')` check accepts the
  // literal string "Bearer x" (see the note at the top of this file). Same
  // verification as the cookie path, so both are one trust decision. Bearer
  // requests carry no ambient credential, so they are not CSRF-able.
  const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers?.authorization ?? '');
  if (bearer) return verifyAccessToken(bearer[1]);

  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () =>
          Object.entries(request.cookies ?? {}).map(([name, value]) => ({
            name,
            value: String(value),
          })),
        setAll: () => {
          // No-op: Nest never writes cookies back.
        },
      },
    },
  );

  // Local read from the cookie envelope — no network call. Signature
  // verification is our own job, below.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new UnauthorizedException();
  }

  return verifyAccessToken(session.access_token);
}

/** Throws a plain Error (not a 401) when no verification key is configured. */
export function assertVerifierConfigured(): void {
  const alg = process.env.SUPABASE_JWT_ALG ?? 'HS256';
  if (alg === 'ES256') {
    if (!process.env.SUPABASE_URL) {
      throw new Error('SUPABASE_URL is required for ES256 JWT verification');
    }
  } else if (!process.env.SUPABASE_JWT_SECRET) {
    throw new Error('SUPABASE_JWT_SECRET is required for HS256 JWT verification');
  }
}

/** Returns the verified `sub` claim, or throws UnauthorizedException. */
export async function verifyAccessToken(token: string): Promise<string> {
  // Misconfiguration is a 500 at the first request, not a silent
  // "verify against the key `undefined`".
  assertVerifierConfigured();
  try {
    const alg = process.env.SUPABASE_JWT_ALG ?? 'HS256';
    // Supabase user access tokens always carry aud = 'authenticated'.
    const opts = { audience: 'authenticated' };
    const { payload } =
      alg === 'ES256'
        ? await jwtVerify(token, getJwks(), opts)
        : await jwtVerify(
            token,
            new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET),
            opts,
          );

    if (typeof payload.sub !== 'string') {
      throw new Error('token has no sub claim');
    }
    return payload.sub;
  } catch {
    throw new UnauthorizedException();
  }
}
