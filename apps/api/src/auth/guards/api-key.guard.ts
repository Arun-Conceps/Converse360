import { createHash } from 'node:crypto';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasMinRole } from '../role-rank.util';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import {
  forbidden,
  rateLimited,
  unauthorized,
} from '../../v1/utils/respond.util';
import {
  REQUIRE_SCOPE_KEY,
  type ApiScope,
} from '../decorators/require-scope.decorator';
import type { RequestWithAccountContext } from '../decorators/current-account.decorator';
// Imported rather than re-declared: a second copy of this string would let
// key generation and key validation drift apart silently.
import { API_KEY_PREFIX } from '../../account/utils/api-keys.util';

/** Failed-key attempts allowed per IP per minute, checked BEFORE the lookup. */
const INVALID_KEY_LIMIT = { limit: 60, windowMs: 60_000 };
/** Membership re-check cache. Short enough that a removal bites within seconds. */
const MEMBER_CACHE_MS = 30_000;
const memberCache = new Map<string, { ok: boolean; at: number }>();
/** Test hook. */
export function clearApiKeyMemberCache(): void {
  memberCache.clear();
}

/** Rate limit for the public REST API. */
const PUBLIC_API_RATE_LIMIT = { limit: 120, windowMs: 60_000 };

function extractKey(request: Request): string | null {
  const header = request.headers['authorization'];
  if (!header) return null;
  const value = header.startsWith('Bearer ')
    ? header.slice('Bearer '.length).trim()
    : header.trim();
  return value.length > 0 ? value : null;
}

function looksLikeApiKey(value: string): boolean {
  return (
    value.startsWith(API_KEY_PREFIX) && value.length > API_KEY_PREFIX.length
  );
}

function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

/**
 * Bearer API-key auth for the public API — a 1:1 port of
 * apps/web/src/lib/auth/api-context.ts's `requireApiKey()`.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
    private readonly reflector: Reflector,
  ) {}

  private async noteFailure(failKey: string): Promise<void> {
    const r = await this.rateLimit.check(failKey, INVALID_KEY_LIMIT);
    if (!r.success) throw rateLimited(r);
  }

  private async creatorStillEntitled(
    accountId: string,
    createdBy: string | null,
  ): Promise<boolean> {
    if (!createdBy) return false;
    const ck = `${accountId}:${createdBy}`;
    const hit = memberCache.get(ck);
    if (hit && Date.now() - hit.at < MEMBER_CACHE_MS) return hit.ok;
    const m = await this.prisma.account_members.findUnique({
      where: {
        account_id_user_id: { account_id: accountId, user_id: createdBy },
      },
      select: { role: true },
    });
    const ok = !!m && hasMinRole(m.role, 'admin');
    memberCache.set(ck, { ok, at: Date.now() });
    return ok;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<RequestWithAccountContext>();

    const ip = request.ip ?? 'unknown';
    const failKey = `apikey-fail:${ip}`;

    const presented = extractKey(request);
    if (!presented || !looksLikeApiKey(presented)) {
      await this.noteFailure(failKey);
      throw unauthorized();
    }

    // Already over the failure budget: refuse before touching the database.
    const pre = await this.rateLimit.peek(failKey, INVALID_KEY_LIMIT);
    if (!pre.success) throw rateLimited(pre);

    const row = await this.prisma.apiKey.findUnique({
      where: { keyHash: hashApiKey(presented) },
    });
    // Unknown, revoked, and expired keys all collapse to the same 401 —
    // an attacker probing keys can't distinguish "never existed" from
    // "existed but is dead."
    if (
      !row ||
      row.revokedAt ||
      (row.expiresAt && row.expiresAt.getTime() <= Date.now())
    ) {
      await this.noteFailure(failKey);
      throw unauthorized();
    }

    // A key must not outlive its creator's standing in the workspace: a
    // removed or demoted member's key dies with the membership.
    if (!(await this.creatorStillEntitled(row.accountId, row.createdBy))) {
      throw unauthorized();
    }

    // Rate-limit before the scope check so an unauthorized-scope caller
    // still can't hammer the endpoint for free.
    const limit = await this.rateLimit.check(
      `apikey:${row.id}`,
      PUBLIC_API_RATE_LIMIT,
    );
    if (!limit.success) {
      // 429 + Retry-After / X-RateLimit-* headers — the documented public
      // contract (docs/public-api.md), matching the legacy requireApiKey().
      throw rateLimited(limit);
    }

    const requiredScope = this.reflector.get<ApiScope | undefined>(
      REQUIRE_SCOPE_KEY,
      context.getHandler(),
    );
    if (requiredScope && !row.scopes.includes(requiredScope)) {
      throw forbidden(`This API key is missing the '${requiredScope}' scope`);
    }

    // Fire-and-forget — must never fail the request it authenticates.
    void this.prisma.apiKey
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch((err: unknown) => {
        console.warn('[ApiKeyGuard] last_used_at bump failed:', err);
      });

    request.accountContext = {
      authType: 'api_key',
      accountId: row.accountId,
      keyId: row.id,
      scopes: row.scopes,
      createdBy: row.createdBy,
    };

    return true;
  }
}
