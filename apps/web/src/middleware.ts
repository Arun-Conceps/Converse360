import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { DEFAULT_POST_AUTH_PATH } from '@/lib/auth/next-path'

/**
 * Routes that are public by nature and must never trigger an auth check.
 *
 * These are hit by anonymous visitors on customers' websites, at their
 * traffic volume rather than ours. Every other request below pays a
 * `supabase.auth.getUser()` — a network round trip — and for these it
 * could only ever return "no user". Left in the general path, a customer
 * with a busy site would make us issue one Supabase call per pageview,
 * and the widget would feel slow for a reason nothing in the widget code
 * explains.
 *
 * Ordered so the widget's own paths come first; they are the hottest.
 */
const PUBLIC_PREFIXES = [
  '/widget/',
  '/api/public/',
  // Hosted forms, booking pages, and the reschedule/cancel page.
  //
  // The reschedule page deliberately lives at `/book/manage/<token>` and
  // NOT at `/appointments/<token>`: `/appointments` is the authenticated
  // dashboard route, so a `/appointments/` prefix here would also match
  // `/appointments/types` and silently drop the auth check on a dashboard
  // page. Public and authenticated surfaces must not share a prefix.
  '/f/',
  '/book/',
  // The OAuth / email-link landing point. It must reach its route
  // handler untouched: the handler is what exchanges the code for a
  // session, and anything that returns a different response here
  // (including the signed-in redirect below) throws the code away and
  // strands the user at a failed sign-in.
  '/auth/callback',
] as const

/**
 * Pages an anonymous visitor may load. Everything else redirects to /login.
 * Derived from the route groups under src/app: (auth), join, auth/*,
 * the two Meta data-deletion pages, and the root signpost. `/f/`, `/book/`
 * and `/widget/` are handled earlier by PUBLIC_PREFIXES.
 */
const PUBLIC_EXACT = new Set([
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/ads-data-deletion',
  '/instagram-data-deletion',
])
const PUBLIC_PAGE_PREFIXES = [
  '/auth/',
  // Invite landing: handles its own signed-out state (sends to signup/login
  // with the token preserved).
  '/join/',
  // Static files served from apps/web/public that the matcher does not
  // already exclude by extension.
  '/audio/',
  '/brand/',
  '/icons/',
  '/ecom-logo/',
  '/opus/',
  '/sounds/',
  '/whatsapp-steps/',
] as const

export function isPublicPagePath(pathname: string): boolean {
  return (
    PUBLIC_EXACT.has(pathname) ||
    PUBLIC_PAGE_PREFIXES.some((p) => pathname.startsWith(p))
  )
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // getUser() transparently refreshes an expired access token, which
  // ROTATES the refresh token and writes the new cookies onto
  // `supabaseResponse` via setAll() above. Any response we return in
  // place of `supabaseResponse` (every redirect / JSON branch below)
  // is a fresh object that does NOT carry those Set-Cookie headers, so
  // the rotated token never reaches the browser. The next request then
  // replays the old, now-consumed refresh token, the refresh fails, and
  // the session wedges — the user gets a broken reload after idling and
  // can only recover by manually clearing cookies (issue #288). Copy the
  // refreshed cookies onto whatever response we hand back to fix that.
  const withRefreshedCookies = <T extends NextResponse>(response: T): T => {
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie)
    })
    return response
  }

  // Auth pages - redirect to dashboard if already logged in.
  // Exception: when an invite token is in the query string we
  // send the already-signed-in user to /join/<token> instead so
  // they can accept the invitation in one click. Without this,
  // a forwarded invite link to someone who's already signed in
  // would silently drop them on /dashboard.
  if (user && (
    request.nextUrl.pathname === '/login' ||
    request.nextUrl.pathname === '/signup' ||
    request.nextUrl.pathname === '/forgot-password'
  )) {
    const url = request.nextUrl.clone()
    const inviteToken = request.nextUrl.searchParams.get('invite')
    if (
      inviteToken &&
      (request.nextUrl.pathname === '/login' ||
        request.nextUrl.pathname === '/signup')
    ) {
      url.pathname = `/join/${encodeURIComponent(inviteToken)}`
      url.search = ''
    } else {
      // Same seam as a fresh sign-in: with several workspaces this asks which
      // one, and forwards straight through for everybody else.
      url.pathname = DEFAULT_POST_AUTH_PATH
      url.search = ''
    }
    return withRefreshedCookies(NextResponse.redirect(url))
  }

  // Protected pages - redirect to login if not authenticated.
  //
  // DENY BY DEFAULT: a page is protected unless it is on the explicit public
  // allowlist (`isPublicPagePath`). The previous opt-in `protectedPaths` list
  // silently left `/ads`, `/media` and `/pricing` open to anonymous requests
  // (their data is still behind RLS/API auth, but the shell and its
  // server-rendered bits were reachable). A NEW dashboard route is now
  // protected the day it is created, with nothing to remember.
  // NOTE: next.config.ts `redirects()` runs BEFORE this, so the legacy
  // flat paths (/broadcasts, /templates, …) never reach here.
  // `/api/*` is excluded: it is proxied to apps/api, which authenticates it.
  if (!user && !pathname.startsWith('/api/') && !isPublicPagePath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return withRefreshedCookies(NextResponse.redirect(url))
  }

  // API routes that need auth (not webhooks)
  if (!user && request.nextUrl.pathname.startsWith('/api/whatsapp/') &&
      !request.nextUrl.pathname.includes('/webhook')) {
    return withRefreshedCookies(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
