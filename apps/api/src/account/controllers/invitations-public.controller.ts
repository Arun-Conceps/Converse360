import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  Res,
  HttpStatus,
  Logger,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { hashInviteToken } from '../utils/invitations.util';
import {
  CurrentUserId,
  SupabaseUserGuard,
} from '../../auth/guards/supabase-user.guard';

/** req.ip honours Express's `trust proxy`; raw X-Forwarded-For is client-controlled. */
function getClientIp(req: Request): string {
  return req.ip ?? 'unknown';
}

const INVITE_RATE = { limit: 30, windowMs: 60_000 };

/** Map Postgres SQLSTATE codes to HTTP status codes. */
function rpcStatusCode(code: string): number {
  if (code === '42501') return HttpStatus.UNAUTHORIZED;
  if (code === '22023') return HttpStatus.BAD_REQUEST;
  if (code === '23505') return HttpStatus.CONFLICT;
  return HttpStatus.INTERNAL_SERVER_ERROR;
}

/**
 * Public invitation routes — no auth guard, rate-limited by IP.
 * Uses SECURITY DEFINER RPCs that handle their own auth checks.
 */
@Controller('invitations')
export class InvitationsPublicController {
  private readonly logger = new Logger(InvitationsPublicController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
  ) {}

  private async throttled(req: Request, res: Response): Promise<boolean> {
    const r = await this.rateLimit.check(
      `invite:${getClientIp(req)}`,
      INVITE_RATE,
    );
    if (r.success) return false;
    const retry = Math.max(1, Math.ceil((r.reset - Date.now()) / 1000));
    res
      .status(HttpStatus.TOO_MANY_REQUESTS)
      .set('Retry-After', String(retry))
      .json({ error: 'Too many requests' });
    return true;
  }

  /**
   * GET /api/invitations/:token/peek
   * Public. Returns invite metadata for the /join/<token> page.
   * Hash is computed in app code — plaintext never crosses the DB boundary.
   */
  @Get(':token/peek')
  async peek(
    @Param('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!token || typeof token !== 'string') {
      return res
        .status(HttpStatus.NOT_FOUND)
        .json({ ok: false, reason: 'not_found' });
    }

    if (await this.throttled(req, res)) return;

    try {
      const result = await this.prisma.$queryRawUnsafe<
        Record<string, unknown>[]
      >(`SELECT peek_invitation($1)`, hashInviteToken(token));
      // The RPC returns a single json column named after the function
      const data =
        result[0]?.['peek_invitation'] ??
        result[0]?.['row'] ??
        Object.values(result[0] ?? {})[0];

      return res.status(HttpStatus.OK).json(data);
    } catch (err: unknown) {
      const pg = err as { code?: string };
      const code = pg.code ?? '';
      this.logger.error('peek_invitation RPC error', err);
      return res
        .status(rpcStatusCode(code))
        .json({ ok: false, reason: 'server_error' });
    }
  }

  /**
   * POST /api/invitations/:token/redeem
   * Adds a membership for the signed-in caller.
   *
   * ⚠️⚠️ THIS ENDPOINT HAD TWO DEFECTS AND BOTH ARE FIXED HERE.
   *
   * (1) It never verified anything. Its whole authentication was "does the
   *     Authorization header start with 'Bearer '" — which the literal string
   *     `Bearer x` satisfies — and it then relied on "auth is checked inside
   *     the RPC".
   *
   * (2) The RPC could not check it. `redeem_invitation` opened with
   *     `IF auth.uid() IS NULL THEN RAISE 'Unauthorized'`, and apps/api
   *     connects over Prisma as `postgres`, where `auth.uid()` is NULL. So
   *     every redemption returned 401 — accepting an invitation has never
   *     worked in production. Defect (2) is what hid defect (1).
   *
   * ⚠️ SupabaseUserGuard, not SupabaseAuthGuard: since migration 095 a signup
   * that arrived through an invite link gets no personal workspace, so at the
   * moment of redeeming, "member of no workspace" is the EXPECTED state and a
   * guard that requires one would reject the very request that creates the
   * first membership.
   */
  @Post(':token/redeem')
  @UseGuards(SupabaseUserGuard)
  async redeem(
    @Param('token') token: string,
    @CurrentUserId() userId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (await this.throttled(req, res)) return;
    if (!token || typeof token !== 'string') {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: 'Missing invitation token' });
    }

    try {
      const result = await this.prisma.$queryRawUnsafe<
        { redeem_invitation: string }[]
      >(
        `SELECT redeem_invitation($1, $2::uuid)`,
        hashInviteToken(token),
        userId,
      );
      const accountId = result[0]?.redeem_invitation ?? null;
      return res.status(HttpStatus.OK).json({ ok: true, accountId });
    } catch (err: unknown) {
      const pg = err as { code?: string; message?: string };
      const code = pg.code ?? '';
      const message = pg.message ?? 'Failed to redeem invitation';
      if (code === '42501' || code === '22023' || code === '23505') {
        return res.status(rpcStatusCode(code)).json({ error: message });
      }
      this.logger.error('redeem_invitation RPC error', err);
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ error: 'Failed to redeem invitation' });
    }
  }
}
