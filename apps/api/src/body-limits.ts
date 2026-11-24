import { json, urlencoded } from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Default request body: ample for ordinary JSON and Meta webhook payloads. */
export const DEFAULT_BODY_LIMIT = '1mb';

/**
 * Large body: base64 file uploads inside JSON (service caps are 20 MB, and
 * base64 inflates by ~33%). Keep in step with `client_max_body_size`.
 */
export const LARGE_BODY_LIMIT = '32mb';

/**
 * Path prefixes that legitimately accept base64 uploads. Everything else —
 * including unauthenticated routes and webhooks — gets the small default.
 * Matched on whole path segments, so `/ads/media-x` does not match `/ads/media`.
 */
export const LARGE_BODY_PATHS: readonly string[] = [
  '/ads/media',
  '/ai/knowledge',
  '/public/web/upload',
];

export function wantsLargeBody(path: string): boolean {
  return LARGE_BODY_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Chooses the body-parser size limit by request path. Both parsers carry the
 * `verify` hook so webhook HMAC verification still sees the raw bytes.
 */
export function createBodyParserMiddleware(
  verify: (req: Request, res: unknown, buf: Buffer) => void,
): RequestHandler {
  const build = (limit: string) => ({
    json: json({ limit, verify }),
    form: urlencoded({ extended: true, limit, verify }),
  });
  const small = build(DEFAULT_BODY_LIMIT);
  const large = build(LARGE_BODY_LIMIT);

  return (req: Request, res: Response, next: NextFunction) => {
    const p = wantsLargeBody(req.path) ? large : small;
    p.json(req, res, (err?: unknown) => {
      if (err) return next(err);
      p.form(req, res, next);
    });
  };
}
