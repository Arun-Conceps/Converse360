// ============================================================
// Connection-time SSRF enforcement (closes DNS rebinding).
//
// Validating a hostname and then letting `fetch` resolve it AGAIN leaves a
// window in which a TTL-0 record flips from a public to a private address.
// Here the check and the dial are the same step: a custom `lookup` resolves
// the name, classifies EVERY address with the shared classifier, and hands
// the socket only addresses that passed. The address that is validated is
// the address that is dialled — there is no second resolution.
//
// Built on node:http(s) so no new dependency is needed. No redirect
// following here: callers follow manually and re-validate each hop.
// ============================================================

import * as dns from 'node:dns';
import * as http from 'node:http';
import * as https from 'node:https';
import { isIP } from 'node:net';
import type { Readable } from 'node:stream';
import * as zlib from 'node:zlib';
import { isBlockedHostname, isBlockedIp } from './ip-classify';

export class BlockedAddressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlockedAddressError';
  }
}

export class PinnedTimeoutError extends Error {
  constructor() {
    super('request timed out');
    this.name = 'TimeoutError';
  }
}

export interface PinnedRequestOptions {
  url: URL;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs: number;
  /** Test seam: replaces dns.lookup. */
  resolver?: (
    host: string,
  ) => Promise<{ address: string; family: number }[]>;
}

export interface PinnedResponse {
  status: number;
  /** Lower-cased names; repeated headers joined with ", ". */
  headers: Record<string, string>;
  stream: Readable;
  destroy(): void;
}

function defaultResolver(host: string) {
  return new Promise<{ address: string; family: number }[]>((resolve, reject) => {
    dns.lookup(host, { all: true, verbatim: true }, (err, addrs) =>
      err ? reject(err) : resolve(addrs),
    );
  });
}

/** Resolve + validate in one step; every address must be public. */
async function resolveValidated(
  host: string,
  resolver: NonNullable<PinnedRequestOptions['resolver']>,
): Promise<{ address: string; family: number }[]> {
  const addrs = await resolver(host);
  if (!addrs || addrs.length === 0) {
    throw new Error(`could not resolve ${host}`);
  }
  for (const a of addrs) {
    if (isBlockedIp(a.address)) {
      throw new BlockedAddressError('destination resolves to a non-public address');
    }
  }
  return addrs;
}

export function pinnedRequest(opts: PinnedRequestOptions): Promise<PinnedResponse> {
  const { url, method = 'GET', body, timeoutMs } = opts;
  const resolver = opts.resolver ?? defaultResolver;
  const host = url.hostname.replace(/^\[|\]$/g, '');

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return Promise.reject(new BlockedAddressError('unsupported scheme'));
  }
  if (isIP(host) ? isBlockedIp(host) : isBlockedHostname(host)) {
    return Promise.reject(new BlockedAddressError('destination is not public'));
  }

  const lib = url.protocol === 'https:' ? https : http;
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  const has = (n: string) =>
    Object.keys(headers).some((k) => k.toLowerCase() === n);
  if (!has('accept-encoding')) headers['Accept-Encoding'] = 'identity';
  const payload = body === undefined ? undefined : Buffer.from(body);
  if (payload && !has('content-length')) {
    headers['Content-Length'] = String(payload.byteLength);
  }

  return new Promise<PinnedResponse>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      req.destroy(new PinnedTimeoutError());
    }, timeoutMs);

    const fail = (err: unknown) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(err);
      }
    };

    const req = lib.request(
      {
        protocol: url.protocol,
        // For a literal IP, node skips `lookup` — validated above.
        host,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method,
        headers,
        agent: false,
        // THE PIN: runs for the dial itself, so what is checked is what
        // is connected to.
        lookup: (
          hostname: string,
          options: dns.LookupOptions,
          cb: (...args: any[]) => void,
        ) => {
          resolveValidated(hostname, resolver).then(
            (addrs) => {
              if (options && options.all) cb(null, addrs);
              else cb(null, addrs[0].address, addrs[0].family);
            },
            (err) => cb(err),
          );
        },
      } as http.RequestOptions,
      (res) => {
        settled = true;
        const outHeaders: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (v === undefined) continue;
          outHeaders[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
        }
        let stream: Readable = res;
        const enc = (outHeaders['content-encoding'] ?? '').toLowerCase();
        if (enc === 'gzip' || enc === 'x-gzip') stream = res.pipe(zlib.createGunzip());
        else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
        else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());
        if (stream !== res) {
          delete outHeaders['content-encoding'];
          res.on('error', (e) => stream.destroy(e));
        }
        const done = () => clearTimeout(timer);
        stream.on('close', done);
        stream.on('end', done);
        resolve({
          status: res.statusCode ?? 0,
          headers: outHeaders,
          stream,
          destroy: () => {
            clearTimeout(timer);
            res.destroy();
            req.destroy();
          },
        });
      },
    );
    req.on('error', (err) => {
      if (settled) return; // body-phase errors surface on the stream
      fail(err);
    });
    if (payload) req.write(payload);
    req.end();
  });
}

/** Read a stream up to `maxBytes`, then stop the transfer. */
export async function readStreamCapped(
  stream: Readable,
  maxBytes: number,
): Promise<{ buffer: Buffer; truncated: boolean }> {
  const chunks: Buffer[] = [];
  let total = 0;
  let truncated = false;
  try {
    for await (const chunk of stream) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.byteLength;
      if (total > maxBytes) {
        chunks.push(buf.subarray(0, Math.max(0, buf.byteLength - (total - maxBytes))));
        truncated = true;
        break;
      }
      chunks.push(buf);
    }
  } finally {
    stream.destroy();
  }
  return { buffer: Buffer.concat(chunks), truncated };
}
