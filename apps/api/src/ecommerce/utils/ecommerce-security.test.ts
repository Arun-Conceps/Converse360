import 'reflect-metadata';
import { describe, it, expect, beforeAll } from 'vitest';
import {
  encryptCredential,
  decryptCredential,
  INTEGRATION_PUBLIC_SELECT,
} from './credentials.util';
import { normalizeStoreUrl, isShopifyShopDomain } from './store-url.util';
import { encodeShopifyState, decodeShopifyState } from './shopify-oauth-state.util';
import { REQUIRE_ROLE_KEY } from '../../auth/decorators/require-role.decorator';
import { AccountApiKeysController } from '../../account/controllers/account-api-keys.controller';
import { AccountInvitationsController } from '../../account/controllers/account-invitations.controller';
import { EcommerceController } from '../controllers/ecommerce.controller';
import { ZapierController } from '../../integrations/controllers/zapier.controller';
import { CtwaController } from '../../campaigns/controllers/ctwa.controller';
import { CampaignSchedulesController } from '../../campaigns/controllers/campaign-schedules.controller';

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  process.env.SHOPIFY_CLIENT_SECRET = 'shpss_test';
});

describe('credential encryption', () => {
  it('round-trips and does not store plaintext', () => {
    const c = encryptCredential('shpat_secret')!;
    expect(c).not.toContain('shpat_secret');
    expect(decryptCredential(c)).toBe('shpat_secret');
  });
  it('reads legacy plaintext rows', () => {
    expect(decryptCredential('ck_legacy')).toBe('ck_legacy');
    expect(decryptCredential(null)).toBeNull();
  });
  it('public select omits every secret column', () => {
    const keys = Object.keys(INTEGRATION_PUBLIC_SELECT);
    for (const k of ['api_key', 'api_secret', 'access_token']) {
      expect(keys).not.toContain(k);
    }
  });
});

describe('store url validation', () => {
  it('accepts myshopify hosts and normalises', () => {
    expect(normalizeStoreUrl('shopify', 'Acme.myshopify.com/')).toBe(
      'https://acme.myshopify.com',
    );
  });
  it.each([
    'http://acme.myshopify.com',
    'https://evil.com',
    'https://acme.myshopify.com.evil.com',
    'https://user:pw@acme.myshopify.com',
    'https://127.0.0.1',
  ])('rejects shopify %s', (u) => {
    expect(normalizeStoreUrl('shopify', u)).toBeNull();
  });
  it('requires https for woocommerce', () => {
    expect(normalizeStoreUrl('woocommerce', 'http://shop.com')).toBeNull();
    expect(normalizeStoreUrl('woocommerce', 'https://shop.com/store/')).toBe(
      'https://shop.com/store',
    );
  });
  it('shop domain check', () => {
    expect(isShopifyShopDomain('a.myshopify.com')).toBe(true);
    expect(isShopifyShopDomain('a.myshopify.com.evil.io')).toBe(false);
  });
});

describe('shopify oauth state', () => {
  const payload = { accountId: 'a1', userId: 'u1', integrationId: 'i1' };
  it('round-trips signed state', () => {
    expect(decodeShopifyState(encodeShopifyState(payload))).toMatchObject(payload);
  });
  it('rejects the old unsigned base64 form and tampering', () => {
    const legacy = Buffer.from(JSON.stringify({ integrationId: 'i1' })).toString('base64');
    expect(decodeShopifyState(legacy)).toBeNull();
    const good = encodeShopifyState(payload);
    expect(decodeShopifyState(good.slice(0, -2) + 'xx')).toBeNull();
  });
});

describe('role metadata (viewers must not pass)', () => {
  const role = (cls: any, m: string) =>
    Reflect.getMetadata(REQUIRE_ROLE_KEY, cls.prototype[m]);
  it.each([
    [AccountApiKeysController, 'listApiKeys', 'admin'],
    [AccountApiKeysController, 'createApiKey', 'admin'],
    [AccountApiKeysController, 'revokeApiKey', 'admin'],
    [AccountInvitationsController, 'listInvitations', 'admin'],
    [AccountInvitationsController, 'createInvitation', 'admin'],
    [AccountInvitationsController, 'revokeInvitation', 'admin'],
    [EcommerceController, 'createIntegration', 'admin'],
    [EcommerceController, 'syncIntegration', 'admin'],
    [ZapierController, 'create', 'admin'],
    [ZapierController, 'update', 'admin'],
    [ZapierController, 'remove', 'admin'],
    [ZapierController, 'test', 'admin'],
    [CtwaController, 'createCampaign', 'agent'],
    [CtwaController, 'trackClick', 'agent'],
    [CampaignSchedulesController, 'createSchedule', 'agent'],
  ])('%o.%s requires %s', (cls, m, r) => {
    expect(role(cls, m)).toBe(r);
  });
});
