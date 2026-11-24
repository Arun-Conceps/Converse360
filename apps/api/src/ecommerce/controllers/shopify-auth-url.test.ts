import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { REQUIRE_ROLE_KEY } from '../../auth/decorators/require-role.decorator';
import { EcommerceController } from './ecommerce.controller';
import { decodeShopifyState } from '../utils/shopify-oauth-state.util';

const account = { accountId: 'acc-1', userId: 'u-1', role: 'admin' } as never;

function makeRes() {
  const res: Record<string, ReturnType<typeof vi.fn>> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('POST ecommerce/shopify/auth-url', () => {
  const prisma = { ecommerce_integrations: { findFirst: vi.fn() } };
  let ctl: EcommerceController;

  beforeEach(() => {
    process.env.SHOPIFY_CLIENT_ID = 'cid';
    process.env.SHOPIFY_CLIENT_SECRET = 'csecret';
    process.env.SHOPIFY_REDIRECT_URI = 'https://api.test/ecommerce/shopify/callback';
    prisma.ecommerce_integrations.findFirst.mockReset();
    ctl = new EcommerceController(prisma as never, {} as never);
  });

  it('is admin-only', () => {
    expect(
      Reflect.getMetadata(
        REQUIRE_ROLE_KEY,
        EcommerceController.prototype.shopifyAuthUrl,
      ),
    ).toBe('admin');
  });

  it('returns an authorize URL carrying state the callback accepts', async () => {
    prisma.ecommerce_integrations.findFirst.mockResolvedValue({ id: 'int-1' });
    const res = makeRes();
    await ctl.shopifyAuthUrl(
      account,
      { integrationId: 'int-1', shop: 'Acme.myshopify.com' },
      res as never,
    );
    expect(prisma.ecommerce_integrations.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'int-1', account_id: 'acc-1' }),
      }),
    );
    const { url } = res.json.mock.calls[0][0] as { url: string };
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(
      'https://acme.myshopify.com/admin/oauth/authorize',
    );
    expect(u.searchParams.get('client_id')).toBe('cid');
    expect(decodeShopifyState(u.searchParams.get('state')!)).toMatchObject({
      accountId: 'acc-1',
      integrationId: 'int-1',
    });
  });

  it('rejects a non-myshopify shop', async () => {
    const res = makeRes();
    await ctl.shopifyAuthUrl(
      account,
      { integrationId: 'int-1', shop: 'evil.com' },
      res as never,
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("404s for another account's integration", async () => {
    prisma.ecommerce_integrations.findFirst.mockResolvedValue(null);
    const res = makeRes();
    await ctl.shopifyAuthUrl(
      account,
      { integrationId: 'other', shop: 'a.myshopify.com' },
      res as never,
    );
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('503s when not configured', async () => {
    delete process.env.SHOPIFY_REDIRECT_URI;
    const res = makeRes();
    await ctl.shopifyAuthUrl(
      account,
      { integrationId: 'i', shop: 'a.myshopify.com' },
      res as never,
    );
    expect(res.status).toHaveBeenCalledWith(503);
  });
});
