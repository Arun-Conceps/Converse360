/**
 * Which origin the auth callback redirects the browser to.
 *
 * `x-forwarded-host` is a request header: unless the proxy in front strips
 * and rewrites it, a caller can set it to anything and turn the callback into
 * an open redirect. So it is no longer trusted on its own:
 *
 *   1. A configured canonical origin (`NEXT_PUBLIC_SITE_URL` / `APP_URL`) wins.
 *   2. Otherwise a forwarded host is honoured only if it is on the
 *      `AUTH_ALLOWED_HOSTS` allowlist (comma-separated hostnames).
 *   3. Otherwise the request URL's own origin.
 */
export interface RedirectBaseInput {
  requestOrigin: string
  forwardedHost: string | null
  forwardedProto: string | null
  siteUrl?: string | undefined
  appUrl?: string | undefined
  allowedHosts?: string | undefined
  isDevelopment?: boolean
}

function originOf(value: string | undefined): string | null {
  if (!value || !value.trim()) return null
  try {
    const u = new URL(value.trim())
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    return u.origin
  } catch {
    return null
  }
}

export function resolveRedirectBase(input: RedirectBaseInput): string {
  if (input.isDevelopment) return input.requestOrigin

  const configured = originOf(input.siteUrl) ?? originOf(input.appUrl)
  if (configured) return configured

  const host = input.forwardedHost?.split(',')[0]?.trim().toLowerCase()
  if (host) {
    const allowed = (input.allowedHosts ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean)
    if (allowed.includes(host)) {
      const proto = input.forwardedProto === 'http' ? 'http' : 'https'
      return `${proto}://${host}`
    }
  }
  return input.requestOrigin
}
