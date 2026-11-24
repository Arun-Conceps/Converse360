/**
 * Where a submitted form may send the visitor.
 *
 * The URL is customer-authored and assigned to `window.location.href` on a
 * public page, so `javascript:` there is stored XSS. The API refuses to save
 * and drops anything unsafe on read (apps/api forms/form-public-guard.ts);
 * this is the browser-side guard for responses from an older or compromised
 * server. Keep the two in step.
 */
export function safeRedirectTarget(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // Browsers strip tab/CR/LF inside a URL and trim control chars/space at the
  // ends, so "java\nscript:" would run. Refuse them outright.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000- \u007f]/.test(value)) return null;
  if (value.length === 0 || value.length > 2048) return null;
  // Absolute only: `//evil.test` and `/path` are not what the author saved.
  if (!/^https?:\/\//i.test(value)) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname || u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}
