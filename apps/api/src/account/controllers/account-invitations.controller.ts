import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Res,
  HttpStatus,
  UseGuards,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { RequiresEntitlement } from '../../subscription/guards/entitlement.guard';
import type { Response } from 'express';
import { SupabaseAuthGuard } from '../../auth/guards/supabase-auth.guard';
import { RequireRole } from '../../auth/decorators/require-role.decorator';
import { CurrentAccount } from '../../auth/decorators/current-account.decorator';
import type { SupabaseAccountContext } from '../../auth/types/account-context.type';
import { hasMinRole } from '../../auth/role-rank.util';
import { PrismaService } from '../../prisma/prisma.service';
import {
  generateInviteToken,
  clampExpiryDays,
  inviteExpiresAt,
  inviteUrl,
} from '../utils/invitations.util';

const MAX_LABEL_LEN = 80;

const VALID_ROLES = ['admin', 'agent', 'viewer'] as const;
type InviteRole = (typeof VALID_ROLES)[number];

function isInviteRole(v: unknown): v is InviteRole {
  return (
    typeof v === 'string' && (VALID_ROLES as readonly string[]).includes(v)
  );
}

const MAX_PENDING_INVITES = 50;

/**
 * Base URL for invite links. Deliberately NOT derived from Host or
 * X-Forwarded-Host: those are request-controlled, so reflecting them lets
 * a spoofed header mint invite links pointing at an attacker's domain.
 */
export function getBaseUrl(): string {
  const configured = (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.APP_URL ??
    process.env.SITE_URL ??
    ''
  ).trim();
  if (!configured) {
    throw new ServiceUnavailableException(
      'Invite links are not configured: set NEXT_PUBLIC_SITE_URL (or APP_URL).',
    );
  }
  return configured.replace(/\/+$/, '');
}

@Controller('account')
@UseGuards(SupabaseAuthGuard)
export class AccountInvitationsController {
  private readonly logger = new Logger(AccountInvitationsController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /api/account/invitations
   * List outstanding (un-redeemed, non-expired) invitations. Admin+.
   */
  @RequireRole('admin')
  @Get('invitations')
  async listInvitations(
    @CurrentAccount() account: SupabaseAccountContext,
    @Res() res: Response,
  ) {
    const invitations = await this.prisma.account_invitations.findMany({
      where: {
        account_id: account.accountId,
        accepted_at: null,
        expires_at: { gt: new Date() },
      },
      select: {
        id: true,
        role: true,
        label: true,
        created_by_user_id: true,
        created_at: true,
        expires_at: true,
        accepted_at: true,
        accepted_by_user_id: true,
      },
      orderBy: { created_at: 'desc' },
    });

    return res.status(HttpStatus.OK).json({ invitations });
  }

  /**
   * POST /api/account/invitations
   * Create a new invite link. Admin+.
   * Token is returned ONCE in the response; only its hash is persisted.
   */
  @RequireRole('admin')
  @Post('invitations')
  @RequiresEntitlement('team_members')
  async createInvitation(
    @CurrentAccount() account: SupabaseAccountContext,
    @Body() body: { role?: unknown; expiresInDays?: unknown; label?: unknown },
    @Res() res: Response,
  ) {
    const role = body?.role;
    if (!isInviteRole(role)) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        error: "'role' must be one of admin, agent, viewer",
      });
    }

    // Never mint a role above the inviter's own.
    if (!hasMinRole(account.role, role)) {
      return res.status(HttpStatus.FORBIDDEN).json({
        error: 'You cannot invite someone to a role higher than your own',
      });
    }

    const expiresInDays =
      typeof body?.expiresInDays === 'number' ? body.expiresInDays : undefined;
    const expiryDays = clampExpiryDays(expiresInDays);
    const expiresAt = inviteExpiresAt(expiryDays);

    let label: string | null = null;
    if (typeof body?.label === 'string') {
      const trimmed = body.label.trim();
      if (trimmed.length > MAX_LABEL_LEN) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: `Label must be ${MAX_LABEL_LEN} characters or fewer`,
        });
      }
      label = trimmed === '' ? null : trimmed;
    }

    const baseUrl = getBaseUrl();

    const pending = await this.prisma.account_invitations.count({
      where: {
        account_id: account.accountId,
        accepted_at: null,
        expires_at: { gt: new Date() },
      },
    });
    if (pending >= MAX_PENDING_INVITES) {
      return res.status(HttpStatus.CONFLICT).json({
        error: `Limit of ${MAX_PENDING_INVITES} pending invitations reached. Revoke some first.`,
      });
    }

    const { token, hash } = generateInviteToken();

    const invitation = await this.prisma.account_invitations.create({
      data: {
        account_id: account.accountId,
        token_hash: hash,
        role,
        created_by_user_id: account.userId,
        label,
        expires_at: expiresAt,
      },
      select: {
        id: true,
        role: true,
        label: true,
        expires_at: true,
        created_at: true,
      },
    });

    return res.status(HttpStatus.CREATED).json({
      invitation,
      token,
      url: inviteUrl(token, baseUrl),
      expiresInDays: expiryDays,
    });
  }

  /**
   * DELETE /api/account/invitations/:id
   * Revoke a pending invitation. Admin+.
   */
  @RequireRole('admin')
  @Delete('invitations/:id')
  async revokeInvitation(
    @Param('id') id: string,
    @CurrentAccount() account: SupabaseAccountContext,
    @Res() res: Response,
  ) {
    const deleted = await this.prisma.account_invitations.deleteMany({
      where: { id, account_id: account.accountId },
    });

    if (deleted.count === 0) {
      return res
        .status(HttpStatus.NOT_FOUND)
        .json({ error: 'Invitation not found' });
    }

    return res.status(HttpStatus.OK).json({ ok: true });
  }
}
