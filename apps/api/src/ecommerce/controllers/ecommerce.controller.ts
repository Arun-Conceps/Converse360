import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  Res,
  HttpStatus,
  UseGuards,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { SupabaseAuthGuard } from '../../auth/guards/supabase-auth.guard';
import { CurrentAccount } from '../../auth/decorators/current-account.decorator';
import type { SupabaseAccountContext } from '../../auth/types/account-context.type';
import { RequireRole } from '../../auth/decorators/require-role.decorator';
import { safeFetch } from '../../ai/lib/http-guard';
import {
  INTEGRATION_PUBLIC_SELECT,
  encryptCredential,
} from '../utils/credentials.util';
import {
  normalizeStoreUrl,
  isShopifyShopDomain,
} from '../utils/store-url.util';
import {
  decodeShopifyState,
  encodeShopifyState,
} from '../utils/shopify-oauth-state.util';
import { PrismaService } from '../../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { ECOMMERCE_SYNC_QUEUE } from '../../queue/queue.constants';

@Controller('ecommerce')
@UseGuards(SupabaseAuthGuard)
export class EcommerceController {
  private readonly logger = new Logger(EcommerceController.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(ECOMMERCE_SYNC_QUEUE) private readonly syncQueue: Queue,
  ) {}

  /** GET /api/ecommerce/integrations — list connected stores. */
  @Get('integrations')
  async listIntegrations(
    @CurrentAccount() account: SupabaseAccountContext,
    @Res() res: Response,
  ) {
    const integrations = await this.prisma.ecommerce_integrations.findMany({
      where: { account_id: account.accountId },
      select: INTEGRATION_PUBLIC_SELECT,
      orderBy: { created_at: 'desc' },
    });

    return res.status(HttpStatus.OK).json({ integrations });
  }

  /** POST /api/ecommerce/integrations — save store credentials. */
  @Post('integrations')
  @RequireRole('admin')
  async createIntegration(
    @CurrentAccount() account: SupabaseAccountContext,
    @Body()
    body: {
      platform?: unknown;
      store_url?: unknown;
      api_key?: unknown;
      api_secret?: unknown;
      access_token?: unknown;
    },
    @Res() res: Response,
  ) {
    const { platform, store_url } = body;

    if (!platform || !store_url) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: 'platform and store_url are required' });
    }

    if (!['shopify', 'woocommerce'].includes(platform as string)) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        error: 'Invalid platform. Must be shopify or woocommerce',
      });
    }

    const storeUrl = normalizeStoreUrl(platform as string, store_url);
    if (!storeUrl) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        error:
          platform === 'shopify'
            ? 'store_url must be an https://<shop>.myshopify.com address'
            : 'store_url must be a valid https:// address',
      });
    }
    for (const k of ['api_key', 'api_secret', 'access_token'] as const) {
      const v = body[k];
      if (v !== undefined && v !== null && typeof v !== 'string') {
        return res
          .status(HttpStatus.BAD_REQUEST)
          .json({ error: `${k} must be a string` });
      }
    }

    try {
      const integration = await this.prisma.ecommerce_integrations.create({
        data: {
          account_id: account.accountId,
          platform: platform as string,
          store_url: storeUrl,
          api_key: encryptCredential(body.api_key as string | undefined),
          api_secret: encryptCredential(body.api_secret as string | undefined),
          access_token: encryptCredential(
            body.access_token as string | undefined,
          ),
          status: 'disconnected',
        },
        select: INTEGRATION_PUBLIC_SELECT,
      });

      return res.status(HttpStatus.CREATED).json({ integration });
    } catch (err: unknown) {
      const pg = err as { code?: string };
      if (pg.code === 'P2002') {
        // Unique constraint — duplicate platform for this account
        return res.status(HttpStatus.CONFLICT).json({
          error: `You already have a ${platform as string} integration. Please delete it first.`,
        });
      }
      throw err;
    }
  }

  /**
   * POST /api/ecommerce/shopify/auth-url — mint the Shopify authorize URL.
   *
   * The callback only accepts the signed state `encodeShopifyState` makes,
   * and this is the one place that makes it. Admin-only; the integration
   * must belong to the caller's account (Prisma bypasses RLS, so the
   * account filter is the only check) and `shop` must be a real
   * `*.myshopify.com` host, since the browser is sent there.
   */
  @Post('shopify/auth-url')
  @RequireRole('admin')
  async shopifyAuthUrl(
    @CurrentAccount() account: SupabaseAccountContext,
    @Body() body: { integrationId?: unknown; shop?: unknown },
    @Res() res: Response,
  ) {
    const { integrationId, shop } = body ?? {};
    if (typeof integrationId !== 'string' || !integrationId) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: 'integrationId is required' });
    }
    const storeUrl = normalizeStoreUrl('shopify', shop);
    if (!storeUrl) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        error: 'shop must be an <shop>.myshopify.com address',
      });
    }
    const shopHost = new URL(storeUrl).hostname;

    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const redirectUri = process.env.SHOPIFY_REDIRECT_URI;
    if (!clientId || !process.env.SHOPIFY_CLIENT_SECRET || !redirectUri) {
      return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        error:
          'Shopify is not configured (SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, SHOPIFY_REDIRECT_URI)',
      });
    }

    const integration = await this.prisma.ecommerce_integrations.findFirst({
      where: {
        id: integrationId,
        account_id: account.accountId,
        platform: 'shopify',
      },
      select: { id: true },
    });
    if (!integration) {
      return res
        .status(HttpStatus.NOT_FOUND)
        .json({ error: 'Integration not found' });
    }

    const search = new URLSearchParams({
      client_id: clientId,
      scope: process.env.SHOPIFY_SCOPES || 'read_products,read_orders',
      redirect_uri: redirectUri,
      state: encodeShopifyState({
        accountId: account.accountId,
        userId: account.userId,
        integrationId: integration.id,
      }),
    });

    return res.status(HttpStatus.OK).json({
      url: `https://${shopHost}/admin/oauth/authorize?${search.toString()}`,
    });
  }

  /**
   * GET /api/ecommerce/shopify/callback — Shopify OAuth redirect handler.
   * Verifies HMAC, exchanges code for access token, updates integration row.
   * Runs under the session guard (a top-level GET carries the cookie); the
   * signed state must additionally name the same account.
   */
  @Get('shopify/callback')
  async shopifyCallback(
    @CurrentAccount() account: SupabaseAccountContext,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const { code, state, shop, hmac } = req.query as Record<string, string>;

    if (!code || !state || !shop || !hmac) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: 'Missing required parameters' });
    }

    if (!isShopifyShopDomain(shop)) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Invalid shop' });
    }

    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET ?? '';
    const clientId = process.env.SHOPIFY_CLIENT_ID ?? '';
    if (!clientSecret) {
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ error: 'Shopify is not configured' });
    }

    // Verify HMAC: remove hmac param, sort remaining, compute SHA-256
    const params = new URLSearchParams(req.query as Record<string, string>);
    params.delete('hmac');
    const sortedParams = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');

    const computedBuf = createHmac('sha256', clientSecret)
      .update(sortedParams)
      .digest();
    const hmacBuf = /^[0-9a-f]{64}$/i.test(hmac)
      ? Buffer.from(hmac, 'hex')
      : Buffer.alloc(0);

    const valid =
      hmacBuf.length === computedBuf.length &&
      timingSafeEqual(hmacBuf, computedBuf);

    if (!valid) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Invalid HMAC' });
    }

    // Signed, expiring state bound to the account that started the flow.
    const stateData = decodeShopifyState(state);
    if (!stateData || stateData.accountId !== account.accountId) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: 'Invalid state' });
    }

    const integration = await this.prisma.ecommerce_integrations.findFirst({
      where: {
        id: stateData.integrationId,
        account_id: account.accountId,
        platform: 'shopify',
      },
      select: { id: true },
    });
    if (!integration) {
      return res
        .status(HttpStatus.NOT_FOUND)
        .json({ error: 'Integration not found' });
    }

    // Exchange code for access token
    let tokenData: { access_token?: string };
    try {
      const tokenRes = await safeFetch({
        url: `https://${shop}/admin/oauth/access_token`,
        method: 'POST',
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
        }),
        timeoutMs: 15_000,
        maxBytes: 64 * 1024,
      });
      tokenData = JSON.parse(tokenRes.body) as { access_token?: string };
      if (tokenRes.status < 200 || tokenRes.status >= 300) {
        throw new Error('Token exchange failed');
      }
      if (!tokenData.access_token) throw new Error('No access token returned');
    } catch (err) {
      this.logger.error('[Shopify OAuth] Token exchange error', err);
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ error: 'Failed to connect to Shopify' });
    }

    await this.prisma.ecommerce_integrations.updateMany({
      where: { id: integration.id, account_id: account.accountId },
      data: {
        store_url: `https://${shop.toLowerCase()}`,
        access_token: encryptCredential(tokenData.access_token),
        status: 'connected',
        sync_error: null,
      },
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    return res.redirect(`${baseUrl}/ecommerce`);
  }

  /** POST /api/ecommerce/sync/:id — pull products + orders from the store. */
  @Post('sync/:id')
  @RequireRole('admin')
  async syncIntegration(
    @Param('id') id: string,
    @CurrentAccount() account: SupabaseAccountContext,
    @Res() res: Response,
  ) {
    const integration = await this.prisma.ecommerce_integrations.findFirst({
      where: { id, account_id: account.accountId },
    });

    if (!integration) {
      return res
        .status(HttpStatus.NOT_FOUND)
        .json({ error: 'Integration not found' });
    }

    if (
      !integration.access_token &&
      (!integration.api_key || !integration.api_secret)
    ) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        error:
          'Integration not configured. Please complete OAuth or enter API credentials.',
      });
    }

    // Queued, not detached. `jobId` is the integration id, so
    // double-clicking "Sync now" cannot start two imports of the same
    // store writing the same rows — the second add is a no-op while
    // the first is still queued or running.
    await this.syncQueue.add(
      'sync',
      { integrationId: id },
      {
        jobId: id,
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: true,
        removeOnFail: { count: 50 },
      },
    );

    return res.status(HttpStatus.ACCEPTED).json({ message: 'Sync started' });
  }
}
