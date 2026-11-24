// ============================================================
// SSRF guard for outbound webhook delivery.
//
// A webhook URL is attacker-influenced (any account admin with
// `webhooks:manage` can register one) and our server makes the request,
// so an unguarded fetch is a Server-Side Request Forgery primitive: a
// URL pointing at `127.0.0.1`, a cloud metadata IP (`169.254.169.254`),
// or an RFC1918 host would let a caller probe / POST to internal
// services from the app's network.
//
// `isDeliverableUrl` resolves the host and rejects any address that is
// loopback, private, link-local, ULA, or otherwise non-publicly-
// routable. Combined with `redirect: 'manual'` at the call site (so a
// public URL can't 3xx-bounce to an internal one), this blocks the
// common SSRF vectors. Address judgement lives in ONE place
// (`ip-classify.ts`, byte-based). DNS rebinding is closed by delivering
// through `pinned-http.ts`, which re-validates the address actually dialled;
// this pre-check just gives a fast, early refusal.
// ============================================================

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { isBlockedHostname, isBlockedIp } from './ip-classify';

/**
 * True for anything that is not a globally routable unicast IP literal:
 * loopback, private, link-local, CGNAT, benchmark, documentation,
 * multicast, reserved, ULA, and every IPv4-in-IPv6 spelling of those
 * (mapped, NAT64, 6to4, compat) in any textual form. Non-IPs return true.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  return isBlockedIp(ip);
}

/**
 * Synchronous, DNS-free check usable at save time: parses, requires
 * http(s), and refuses literal non-public IPs and internal hostnames.
 */
export function isPublicLiteralOrName(rawUrl: string): boolean {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) || host.includes(':')) return !isBlockedIp(host);
  return !isBlockedHostname(host);
}

/**
 * True if `rawUrl`'s host resolves only to publicly-routable
 * address(es). Returns false for a malformed URL, an obvious internal
 * name (`localhost`, `*.local`, `*.internal`), a literal private IP, or
 * a hostname that resolves to any private/reserved address.
 */
export async function isDeliverableUrl(rawUrl: string): Promise<boolean> {
  if (!isPublicLiteralOrName(rawUrl)) return false;
  const host = new URL(rawUrl).hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return true; // literal already classified above

  try {
    const results = await lookup(host, { all: true, verbatim: true });
    if (results.length === 0) return false;
    return results.every((r) => !isBlockedIp(r.address));
  } catch {
    return false; // unresolvable -> not deliverable
  }
}
