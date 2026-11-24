import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LeadWebhookController } from './lead-webhook.controller';

function makeRes() {
  const res: Record<string, ReturnType<typeof vi.fn>> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const body = { object: 'page', entry: [] };
const raw = Buffer.from(JSON.stringify(body));
const sign = (secret: string) =>
  `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;

describe('LeadWebhookController fails closed', () => {
  const queue = { add: vi.fn() };
  let ctl: LeadWebhookController;
  const saved = { ...process.env };

  beforeEach(() => {
    delete process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;
    delete process.env.META_APP_SECRET;
    delete process.env.META_ADS_APP_SECRET;
    ctl = new LeadWebhookController(queue as never);
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('refuses the handshake when no verify token is configured, even with the old default', () => {
    const res = makeRes();
    ctl.verifyChallenge('subscribe', 'wacrm-fb-leads-verify', 'c', res as never);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('accepts the handshake with the configured token only', () => {
    process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN = 'tok';
    const ok = makeRes();
    ctl.verifyChallenge('subscribe', 'tok', 'chal', ok as never);
    expect(ok.status).toHaveBeenCalledWith(200);
    const bad = makeRes();
    ctl.verifyChallenge('subscribe', 'nope', 'chal', bad as never);
    expect(bad.status).toHaveBeenCalledWith(403);
  });

  it('rejects events when no app secret is configured', async () => {
    const res = makeRes();
    await ctl.handleLeadEvent(
      { headers: {}, rawBody: raw, body } as never,
      res as never,
    );
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('rejects a missing or wrong signature, accepts a correct one', async () => {
    process.env.META_APP_SECRET = 's3cret';
    const missing = makeRes();
    await ctl.handleLeadEvent(
      { headers: {}, rawBody: raw, body } as never,
      missing as never,
    );
    expect(missing.status).toHaveBeenCalledWith(403);

    const wrong = makeRes();
    await ctl.handleLeadEvent(
      {
        headers: { 'x-hub-signature-256': sign('other') },
        rawBody: raw,
        body,
      } as never,
      wrong as never,
    );
    expect(wrong.status).toHaveBeenCalledWith(403);

    const good = makeRes();
    await ctl.handleLeadEvent(
      {
        headers: { 'x-hub-signature-256': sign('s3cret') },
        rawBody: raw,
        body,
      } as never,
      good as never,
    );
    expect(good.status).toHaveBeenCalledWith(200);
  });
});
