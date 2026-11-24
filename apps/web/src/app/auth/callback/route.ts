import { resolveRedirectBase } from '@/lib/auth/redirect-base'
import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/server'
import { sanitizeNextPath } from '@/lib/auth/next-path'

/**
 * The single landing point for every Supabase auth redirect:
 * Sign in with Google, and the links in confirmation / recovery emails.
 *
 * TWO EXCHANGE SHAPES, BOTH HANDLED
 *   - `?code=…`       PKCE. What `signInWithOAuth` produces, and what
 *                     the default email templates produce once a
 *                     project is on PKCE.
 *   - `?token_hash=…&type=…`  The email-template style that calls
 *                     `verifyOtp`. Projects differ on which their
 *                     templates emit, and a project can be switched
 *                     after the fact — supporting only one is how you
 *                     get confirmation links that silently dead-end.
 *
 * The browser client stores the PKCE verifier in a cookie, which is why
 * the exchange can happen here on the server at all.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)

  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = sanitizeNextPath(searchParams.get('next'))

  // The provider itself refused (consent denied, misconfigured client).
  // Surface its reason rather than a generic failure — "access_denied"
  // and "redirect_uri_mismatch" need very different fixes.
  const providerError =
    searchParams.get('error_description') ?? searchParams.get('error')
  if (providerError) {
    return redirectTo(request, origin, errorPath(providerError))
  }

  const supabase = await createClient()

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return redirectTo(request, origin, next)
    return redirectTo(request, origin, errorPath(error.message))
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) return redirectTo(request, origin, next)
    return redirectTo(request, origin, errorPath(error.message))
  }

  return redirectTo(request, origin, errorPath('Missing authorization code'))
}

function errorPath(reason: string): string {
  return `/auth/auth-code-error?reason=${encodeURIComponent(reason)}`
}

/**
 * Build the redirect against the host the *user* is on, not the one the
 * app happens to be bound to (loopback behind our proxy in production).
 * `x-forwarded-host` is attacker-controllable, so it is only honoured when
 * allowlisted — see `resolveRedirectBase`. Set NEXT_PUBLIC_SITE_URL (or
 * APP_URL) in production so the canonical origin is used.
 */
function redirectTo(request: Request, origin: string, path: string) {
  const base = resolveRedirectBase({
    requestOrigin: origin,
    forwardedHost: request.headers.get('x-forwarded-host'),
    forwardedProto: request.headers.get('x-forwarded-proto'),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    appUrl: process.env.APP_URL,
    allowedHosts: process.env.AUTH_ALLOWED_HOSTS,
    isDevelopment: process.env.NODE_ENV === 'development',
  })
  return NextResponse.redirect(`${base}${path}`)
}
