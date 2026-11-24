import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

export const WEB_MEDIA_BUCKET = 'web-media';

/** Must stay at or under the bucket's own limit in migration 053. */
const MAX_BYTES = 20 * 1024 * 1024;

/**
 * What a visitor is allowed to upload.
 *
 * A deny-by-default allowlist rather than a blocklist: this is an upload
 * endpoint reachable by anonymous browsers, and the failure of a blocklist
 * is silent (something dangerous you forgot to list). Kept in step with
 * the bucket's `allowed_mime_types`, which is the second line of defence
 * if this one is ever bypassed.
 */
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/heic',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/webm',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
]);

export type WebMediaKind = 'image' | 'video' | 'audio' | 'document';

export interface UploadResult {
  url: string;
  kind: WebMediaKind;
}

/**
 * Visitor and agent attachments for the web channel.
 *
 * WHY UPLOADS GO THROUGH THE API RATHER THAN STRAIGHT TO STORAGE
 *   A direct-to-storage upload needs the browser to hold a storage
 *   credential. Handing one to an anonymous visitor on a third-party site
 *   means the size limit, the MIME allowlist and the per-conversation path
 *   are all enforced by whatever the client chooses to send. Proxying
 *   costs one hop and makes all three server-side facts.
 *
 * PATHS ARE UNGUESSABLE, THE BUCKET IS PUBLIC
 *   `<account_id>/<conversation_id>/<uuid>.<ext>` — three 128-bit values.
 *   Same posture as `flow-media` and `instagram-media`: public read means
 *   an <img src> works with no signed-URL round trip on every render, and
 *   enumeration is not feasible. Note this does mean a leaked URL is
 *   readable by anyone holding it; if that is ever tightened, tighten all
 *   three buckets together.
 */
@Injectable()
export class WebMediaService {
  private readonly logger = new Logger(WebMediaService.name);
  private client: SupabaseClient | null = null;

  private getClient(): SupabaseClient {
    if (this.client) return this.client;

    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      throw new Error(
        'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — web widget attachments cannot be stored.',
      );
    }

    this.client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return this.client;
  }

  async upload(args: {
    accountId: string;
    conversationId: string;
    filename: string;
    contentType: string;
    bytes: Buffer;
  }): Promise<UploadResult> {
    if (args.bytes.length === 0) {
      throw new BadRequestException('That file is empty.');
    }
    if (args.bytes.length > MAX_BYTES) {
      throw new BadRequestException(
        `Files must be under ${Math.floor(MAX_BYTES / 1024 / 1024)} MB.`,
      );
    }

    const contentType = args.contentType.split(';')[0].trim().toLowerCase();
    if (!ALLOWED_MIME.has(contentType)) {
      throw new BadRequestException(
        `Files of type ${contentType} are not allowed.`,
      );
    }

    if (!matchesMagicBytes(contentType, args.bytes)) {
      throw new BadRequestException(
        'That file does not look like the type it claims to be.',
      );
    }

    // Extension derived from the ORIGINAL filename but sanitised to a few
    // safe characters. The filename itself never becomes part of the path:
    // an attacker-controlled path segment invites traversal and, on a
    // public bucket, lets someone choose a URL that impersonates something.
    const extension = safeExtension(args.filename);
    const path = `${args.accountId}/${args.conversationId}/${randomUUID()}${extension}`;

    // Only inert media renders inline from the public bucket. Everything
    // else (pdf, office, csv, zip, text, svg-like surprises) is stored as an
    // opaque download so a browser never interprets it as a page.
    const storedType = INLINE_SAFE.has(contentType)
      ? contentType
      : 'application/octet-stream';

    const client = this.getClient();
    let uploadRes = await client.storage
      .from(WEB_MEDIA_BUCKET)
      .upload(path, args.bytes, { contentType: storedType, upsert: false });

    if (
      uploadRes.error &&
      uploadRes.error.message.toLowerCase().includes('not found')
    ) {
      await client.storage
        .createBucket(WEB_MEDIA_BUCKET, { public: true })
        .catch(() => null);
      uploadRes = await client.storage
        .from(WEB_MEDIA_BUCKET)
        .upload(path, args.bytes, { contentType: storedType, upsert: false });
    }

    if (uploadRes.error) {
      this.logger.error(`web media upload failed: ${uploadRes.error.message}`);
      throw new BadRequestException('Could not store that file.');
    }

    const { data } = client.storage.from(WEB_MEDIA_BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, kind: kindFor(contentType) };
  }
}

const INLINE_SAFE = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/heic',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/webm',
]);

const startsWith = (b: Buffer, sig: number[], at = 0) =>
  b.length >= at + sig.length && sig.every((v, i) => b[at + i] === v);
const ascii = (b: Buffer, at: number, str: string) =>
  b.length >= at + str.length && b.toString('latin1', at, at + str.length) === str;

/**
 * Check the leading bytes against the claimed type. Types with no reliable
 * signature (text/plain, text/csv) must at least contain no NUL bytes and be
 * UTF-8-ish; legacy office formats use the OLE2 header, modern ones are zip.
 */
export function matchesMagicBytes(contentType: string, b: Buffer): boolean {
  switch (contentType) {
    case 'image/png':
      return startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/jpeg':
      return startsWith(b, [0xff, 0xd8, 0xff]);
    case 'image/gif':
      return ascii(b, 0, 'GIF87a') || ascii(b, 0, 'GIF89a');
    case 'image/webp':
      return ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP');
    case 'image/heic':
      return (
        ascii(b, 4, 'ftyp') &&
        ['heic', 'heix', 'hevc', 'mif1', 'msf1'].some((x) => ascii(b, 8, x))
      );
    case 'video/mp4':
    case 'video/quicktime':
    case 'audio/mp4':
      return ascii(b, 4, 'ftyp');
    case 'video/webm':
    case 'audio/webm':
      return startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]);
    case 'audio/ogg':
      return ascii(b, 0, 'OggS');
    case 'audio/mpeg':
      return (
        ascii(b, 0, 'ID3') || (b.length > 1 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0)
      );
    case 'application/pdf':
      return ascii(b, 0, '%PDF-');
    case 'application/zip':
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06]);
    case 'application/msword':
    case 'application/vnd.ms-excel':
      return startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case 'text/plain':
    case 'text/csv':
      return !b.subarray(0, 4096).includes(0);
    default:
      return false;
  }
}

/** Public URL prefix every file we stored for this conversation starts with. */
export function webMediaUrlPrefix(
  accountId: string,
  conversationId: string,
  supabaseUrl = process.env.SUPABASE_URL,
): string | null {
  if (!supabaseUrl) return null;
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${WEB_MEDIA_BUCKET}/${accountId}/${conversationId}/`;
}

/** True only for a URL our own upload endpoint could have returned. */
export function isOwnWebMediaUrl(
  url: string,
  accountId: string,
  conversationId: string,
): boolean {
  const prefix = webMediaUrlPrefix(accountId, conversationId);
  if (!prefix || url.length > 2000) return false;
  if (!url.startsWith(prefix)) return false;
  const rest = url.slice(prefix.length);
  // A single file name, no traversal, query or fragment tricks.
  return /^[A-Za-z0-9-]+(\.[A-Za-z0-9]{1,8})?$/.test(rest);
}

function safeExtension(filename: string): string {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(filename);
  return match ? `.${match[1].toLowerCase()}` : '';
}

/**
 * Map a MIME type onto the `content_type` vocabulary `messages` already
 * uses across all three channels, so the inbox renders a web attachment
 * with the same component as a WhatsApp one.
 */
function kindFor(contentType: string): WebMediaKind {
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('audio/')) return 'audio';
  return 'document';
}
