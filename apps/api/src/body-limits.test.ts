import { describe, it, expect } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createBodyParserMiddleware, wantsLargeBody } from './body-limits';

async function withApp(fn: (base: string) => Promise<void>) {
  const app = express();
  app.use(
    createBodyParserMiddleware((req, _res, buf) => {
      (req as unknown as { rawBody?: Buffer }).rawBody = buf;
    }),
  );
  app.use((req, res) => {
    res.json({
      ok: true,
      raw: Boolean((req as unknown as { rawBody?: Buffer }).rawBody),
      body: req.body,
    });
  });
  app.use(
    (
      err: { status?: number },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(err.status ?? 500).json({ error: true });
    },
  );
  const server = app.listen(0);
  try {
    await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.close();
  }
}

const post = (url: string, body: unknown) =>
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('body limits', () => {
  it('matches only whole-segment upload prefixes', () => {
    expect(wantsLargeBody('/ads/media')).toBe(true);
    expect(wantsLargeBody('/ai/knowledge/upload')).toBe(true);
    expect(wantsLargeBody('/public/web/upload')).toBe(true);
    expect(wantsLargeBody('/ads/media-x')).toBe(false);
    expect(wantsLargeBody('/whatsapp/webhook')).toBe(false);
  });

  it('parses normal JSON and captures raw body', async () => {
    await withApp(async (base) => {
      const r = await post(`${base}/contacts`, { a: 1 });
      expect(await r.json()).toMatchObject({ ok: true, raw: true, body: { a: 1 } });
    });
  });

  it('rejects >1mb on non-upload paths but allows it on upload paths', async () => {
    await withApp(async (base) => {
      const big = { d: 'x'.repeat(2 * 1024 * 1024) };
      expect((await post(`${base}/whatsapp/webhook`, big)).status).toBe(413);
      expect((await post(`${base}/ads/media`, big)).status).toBe(200);
    });
  });
});
