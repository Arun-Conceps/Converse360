// ============================================================
// ONE address classifier for every SSRF guard in the API.
//
// Two guards used to carry their own regex/prefix tests and both only
// unmapped the DOTTED IPv4-mapped form (`::ffff:127.0.0.1`). The WHATWG URL
// parser normalises `http://[::ffff:127.0.0.1]/` to the hex form
// `[::ffff:7f00:1]`, which sailed through. This module parses IPv4 and IPv6
// into BYTES and judges the bytes, so no textual spelling can disagree with
// the numeric value.
//
// Policy: ALLOW ONLY globally routable unicast. Everything else is refused,
// and anything we cannot parse is refused too (fail closed).
// ============================================================

export type ParsedIp =
  | { family: 4; bytes: number[] }
  | { family: 6; bytes: number[] };

function parseIpv4(s: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const out: number[] = [];
  for (let i = 1; i <= 4; i++) {
    // Leading zeros are ambiguous (octal in some stacks): refuse.
    if (m[i].length > 1 && m[i].startsWith('0')) return null;
    const n = Number(m[i]);
    if (n > 255) return null;
    out.push(n);
  }
  return out;
}

function parseIpv6(raw: string): number[] | null {
  let s = raw.toLowerCase();
  const zone = s.indexOf('%');
  if (zone !== -1) s = s.slice(0, zone);
  if (!s.includes(':')) return null;

  // Embedded dotted tail (::ffff:1.2.3.4) -> two hex groups.
  const lastColon = s.lastIndexOf(':');
  const tail = s.slice(lastColon + 1);
  if (tail.includes('.')) {
    const v4 = parseIpv4(tail);
    if (!v4) return null;
    const hi = ((v4[0] << 8) | v4[1]).toString(16);
    const lo = ((v4[2] << 8) | v4[3]).toString(16);
    s = `${s.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const dbl = s.indexOf('::');
  if (dbl !== -1 && s.indexOf('::', dbl + 1) !== -1) return null; // two '::'
  let groups: string[];
  if (dbl !== -1) {
    const head = s.slice(0, dbl);
    const rest = s.slice(dbl + 2);
    const h = head === '' ? [] : head.split(':');
    const t = rest === '' ? [] : rest.split(':');
    const missing = 8 - h.length - t.length;
    if (missing < 1) return null; // '::' must stand for at least one group
    groups = [...h, ...Array<string>(missing).fill('0'), ...t];
  } else {
    groups = s.split(':');
  }
  if (groups.length !== 8) return null;

  const bytes: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    const n = parseInt(g, 16);
    bytes.push(n >> 8, n & 0xff);
  }
  return bytes;
}

/** Parse an IPv4/IPv6 literal (brackets and zone ids tolerated). */
export function parseIp(input: string): ParsedIp | null {
  if (typeof input !== 'string') return null;
  const s = input.trim().replace(/^\[/, '').replace(/\]$/, '');
  if (!s) return null;
  const v4 = parseIpv4(s);
  if (v4) return { family: 4, bytes: v4 };
  const v6 = parseIpv6(s);
  if (v6) return { family: 6, bytes: v6 };
  return null;
}

/** True when the IPv4 bytes are NOT a globally routable unicast address. */
function ipv4Blocked(b: number[]): boolean {
  const [a, b1, b2] = b;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // RFC1918
  if (a === 100 && b1 >= 64 && b1 <= 127) return true; // CGNAT 100.64/10
  if (a === 127) return true; // loopback
  if (a === 169 && b1 === 254) return true; // link-local + cloud metadata
  if (a === 172 && b1 >= 16 && b1 <= 31) return true; // RFC1918
  if (a === 192 && b1 === 0 && b2 === 0) return true; // 192.0.0.0/24 IETF
  if (a === 192 && b1 === 0 && b2 === 2) return true; // TEST-NET-1
  if (a === 192 && b1 === 88 && b2 === 99) return true; // 6to4 relay anycast
  if (a === 192 && b1 === 168) return true; // RFC1918
  if (a === 198 && (b1 === 18 || b1 === 19)) return true; // benchmarking
  if (a === 198 && b1 === 51 && b2 === 100) return true; // TEST-NET-2
  if (a === 203 && b1 === 0 && b2 === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast, reserved 240/4, broadcast
  return false;
}

function ipv6Blocked(b: number[]): boolean {
  const zeros = (from: number, to: number) => {
    for (let i = from; i < to; i++) if (b[i] !== 0) return false;
    return true;
  };

  // ::/96 — unspecified, loopback and the deprecated IPv4-compatible form.
  // Refused wholesale: nothing legitimate lives here, and every embedded
  // address is either private or a deprecated spelling of a public one.
  if (zeros(0, 12)) return true;

  // ::ffff:0:0/96 IPv4-mapped — judge the embedded IPv4.
  if (zeros(0, 10) && b[10] === 0xff && b[11] === 0xff) {
    return ipv4Blocked(b.slice(12, 16));
  }
  // ::ffff:0:0:0/96 (SIIT, RFC 2765) — same embedding rule.
  if (zeros(0, 8) && b[8] === 0xff && b[9] === 0xff && b[10] === 0 && b[11] === 0) {
    return ipv4Blocked(b.slice(12, 16));
  }
  // 64:ff9b::/96 NAT64 — judge the embedded IPv4.
  if (
    b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b &&
    zeros(4, 12)
  ) {
    return ipv4Blocked(b.slice(12, 16));
  }
  // 2002::/16 6to4 — IPv4 sits in bytes 2..5.
  if (b[0] === 0x20 && b[1] === 0x02) {
    return ipv4Blocked(b.slice(2, 6));
  }

  // Only 2000::/3 is global unicast. This one test refuses loopback,
  // ULA fc00::/7, link-local fe80::/10, site-local fec0::/10, multicast
  // ff00::/8, 64:ff9b:1::/48 and every other unassigned space.
  if ((b[0] & 0xe0) !== 0x20) return true;

  // Carve-outs inside 2000::/3.
  if (b[0] === 0x20 && b[1] === 0x01) {
    if (b[2] <= 0x01) return true; // 2001::/23 (Teredo, ORCHID, protocol)
    if (b[2] === 0x0d && b[3] === 0xb8) return true; // 2001:db8::/32 docs
  }
  if (b[0] === 0x3f && b[1] === 0xff && (b[2] & 0xf0) === 0x00) return true; // 3fff::/20 docs
  return false;
}

/**
 * True when `input` is anything other than a globally routable unicast IP
 * literal. Non-IP strings are "blocked" (fail closed).
 */
export function isBlockedIp(input: string): boolean {
  const ip = parseIp(input);
  if (!ip) return true;
  return ip.family === 4 ? ipv4Blocked(ip.bytes) : ipv6Blocked(ip.bytes);
}

/** Hostnames refused by NAME regardless of what they resolve to. */
export function isBlockedHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
  if (!h) return true;
  if (h === 'metadata' || h === 'instance-data') return true;
  return /(^|\.)(localhost|local|localdomain|internal|intranet|home\.arpa|lan|corp)$/.test(
    h,
  );
}
