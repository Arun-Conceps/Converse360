/**
 * Returns `value` only if it is safe to put in an `href` / `src`: an absolute
 * http(s) URL, or a same-origin path (`/x`, not protocol-relative `//x`).
 * Anything else — `javascript:`, `data:`, `vbscript:`, garbage — gives
 * `undefined`, which React renders as an attribute-less (inert) element.
 *
 * Tenant, customer and message-metadata strings reach the DOM through this
 * app; a `javascript:` href stored there would run on our origin on click.
 */
export function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const v = value.trim()
  if (!v) return undefined
  // Control characters / whitespace inside the scheme are a classic bypass.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(v)) return undefined
  if (v.startsWith('/')) return v.startsWith('//') || v[1] === String.fromCharCode(92) ? undefined : v
  try {
    const u = new URL(v)
    return u.protocol === 'http:' || u.protocol === 'https:' ? v : undefined
  } catch {
    return undefined
  }
}
