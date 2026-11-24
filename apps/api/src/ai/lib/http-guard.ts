import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import {
  BlockedAddressError,
  pinnedRequest,
  readStreamCapped,
} from '../../common/security/pinned-http';
import { isBlockedHostname, isBlockedIp } from '../../common/security/ip-classify';
import { AiError } from './types';

/**
 * ============================================================
 * Outbound fetch guard for URLs a USER supplied.
 *
 * Two features in this module hand the server a URL and ask it to make a
 * request: crawling a page into the knowledge base, and custom API
 * actions the agent can call. Both are server-side fetches with the
 * server's own network position, which is the textbook shape of SSRF —
 * without this guard, "crawl http://localhost:8001/ai/config" or
 * "http://169.254.169.254/latest/meta-data/iam/…" is a feature.
 *
 * What is enforced:
 *   - http/https only (no file:, gopher:, data:, ftp:)
 *   - no credentials in the URL (they would leak into logs and, on a
 *     redirect, to a third party)
 *   - every resolved address must be publicly routable: loopback,
 *     private, link-local (incl. cloud metadata), CGNAT, multicast,
 *     unspecified and IPv6 ULA are all refused
 *   - redirects are followed MANUALLY, at most 3, re-validating the host
 *     each hop — a public URL that 302s to 127.0.0.1 is the standard
 *     bypass
 *   - responses are read with a byte cap, so a multi-gigabyte body
 *     cannot exhaust memory
 *
 * DNS REBINDING is closed at connect time: `safeFetch` dials through
 * `common/security/pinned-http.ts`, whose `lookup` hook classifies every
 * address the socket is about to use, so the validated address IS the
 * dialled address. Address judgement is the byte-based shared classifier
 * (`common/security/ip-classify.ts`) — it understands every IPv4-in-IPv6
 * spelling (mapped hex/dotted, NAT64, 6to4, compat), not just one.
 * Headers (Authorization, custom) are dropped when a redirect changes origin.
 * ============================================================
 */

const MAX_REDIRECTS = 3;

export interface SafeFetchOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
  /** Sent as-is; callers pick something honest and identifiable. */
  userAgent?: string;
  /** Accept header, e.g. `text/html` for the crawler. */
  accept?: string;
}

export interface SafeFetchResult {
  status: number;
  contentType: string;
  /** Decoded body, truncated at `maxBytes`. */
  body: string;
  truncated: boolean;
  /** Final URL after redirects. */
  url: string;
}

export function isBlockedAddress(ip: string): boolean {
  return isBlockedIp(ip); // non-IP strings are refused too (fail closed)
}

/**
 * Validate one URL: shape, scheme, credentials, and every address its
 * hostname resolves to. Exported for tests and for the "is this URL
 * usable" check the actions UI runs before saving.
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AiError(`Not a valid URL: ${raw}`, {
      code: 'invalid_url',
      status: 400,
    });
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new AiError(
      `Only http and https URLs are allowed (got ${url.protocol.replace(':', '')}).`,
      { code: 'invalid_url_scheme', status: 400 },
    );
  }

  if (url.username || url.password) {
    throw new AiError(
      'Remove the username/password from the URL — put credentials in a header instead.',
      { code: 'invalid_url_credentials', status: 400 },
    );
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');

  if (isIP(host) || host.includes(':')) {
    if (isBlockedAddress(host)) {
      throw new AiError(
        `${host} is a private or reserved address — only public hosts can be reached.`,
        { code: 'blocked_address', status: 400 },
      );
    }
    return url;
  }

  // `.localhost`, `.local` and friends resolve differently per host; refuse
  // by name as well as by address so the intent is obvious in the error.
  if (isBlockedHostname(host)) {
    throw new AiError(`${host} is an internal hostname and cannot be reached.`, {
      code: 'blocked_address',
      status: 400,
    });
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new AiError(`Could not resolve ${host}.`, {
      code: 'dns_failed',
      status: 400,
    });
  }

  if (addresses.length === 0) {
    throw new AiError(`Could not resolve ${host}.`, {
      code: 'dns_failed',
      status: 400,
    });
  }

  // EVERY address must be public: a host with one public and one private
  // A record would otherwise be a coin toss at connect time.
  for (const { address } of addresses) {
    if (isBlockedAddress(address)) {
      throw new AiError(
        `${host} resolves to a private address (${address}) and cannot be reached.`,
        { code: 'blocked_address', status: 400 },
      );
    }
  }

  return url;
}

/**
 * Fetch a user-supplied URL with every guard above applied.
 * Throws `AiError` for anything refused; HTTP error statuses are
 * returned to the caller, not thrown (an action may legitimately want
 * to see a 404).
 */
export async function safeFetch(
  opts: SafeFetchOptions,
): Promise<SafeFetchResult> {
  const {
    method = 'GET',
    headers = {},
    body,
    timeoutMs = 8000,
    maxBytes = 512 * 1024,
    userAgent = 'Converse360-Agent/1.0 (+https://converse360.io)',
    accept,
  } = opts;

  let target = await assertPublicUrl(opts.url);
  let redirects = 0;
  let sendCallerHeaders = true;

  for (;;) {
    const requestHeaders: Record<string, string> = {
      'User-Agent': userAgent,
      ...(accept ? { Accept: accept } : {}),
      // Authorization / custom headers belong to the ORIGINAL origin only.
      ...(sendCallerHeaders ? headers : {}),
    };
    if (body !== undefined && !Object.keys(requestHeaders).some((k) => k.toLowerCase() === 'content-type')) {
      requestHeaders['Content-Type'] = 'application/json';
    }

    let res;
    try {
      res = await pinnedRequest({
        url: target,
        method,
        headers: requestHeaders,
        body,
        timeoutMs,
      });
    } catch (err) {
      if (err instanceof BlockedAddressError) {
        throw new AiError(
          `${target.host} resolves to a private address and cannot be reached.`,
          { code: 'blocked_address', status: 400 },
        );
      }
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new AiError(`${target.host} took too long to respond.`, {
          code: 'timeout',
          status: 504,
        });
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new AiError(`Could not reach ${target.host}: ${message}`, {
        code: 'network_error',
        status: 502,
      });
    }

    const location = res.headers['location'];
    if (res.status >= 300 && res.status < 400 && location) {
      res.destroy();
      if (redirects >= MAX_REDIRECTS) {
        throw new AiError(`${opts.url} redirected too many times.`, {
          code: 'too_many_redirects',
          status: 400,
        });
      }
      redirects += 1;
      // Re-validate: this is the hop that a public -> 127.0.0.1 redirect
      // uses, and it is the whole reason redirects are followed manually.
      let next: URL;
      try {
        next = new URL(location, target);
      } catch {
        throw new AiError('Redirect to an invalid URL.', {
          code: 'invalid_url',
          status: 400,
        });
      }
      if (next.origin !== target.origin) sendCallerHeaders = false;
      target = await assertPublicUrl(next.toString());
      continue;
    }

    let buffer: Buffer;
    let truncated: boolean;
    try {
      ({ buffer, truncated } = await readStreamCapped(res.stream, maxBytes));
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new AiError(`${target.host} took too long to respond.`, {
          code: 'timeout',
          status: 504,
        });
      }
      throw new AiError(`Could not read from ${target.host}.`, {
        code: 'network_error',
        status: 502,
      });
    }
    return {
      status: res.status,
      contentType: res.headers['content-type'] ?? '',
      body: buffer.toString('utf8'),
      truncated,
      url: target.toString(),
    };
  }
}
