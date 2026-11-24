import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { EntitlementGuard } from './entitlement.guard';

function ctx(accountContext?: { accountId: string }) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ accountContext, method: 'POST', url: '/x' }),
    }),
  } as never;
}

describe('EntitlementGuard', () => {
  const reflector = {
    getAllAndOverride: vi
      .fn()
      .mockReturnValue({ limit: 'messages', amount: 1 }),
  };

  it('fails CLOSED when no account context is attached', async () => {
    const svc = { checkLimit: vi.fn() };
    const g = new EntitlementGuard(reflector as never, svc as never);
    await expect(g.canActivate(ctx())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(svc.checkLimit).not.toHaveBeenCalled();
  });

  it('allows when the limit check allows', async () => {
    const svc = { checkLimit: vi.fn().mockResolvedValue({ allowed: true }) };
    const g = new EntitlementGuard(reflector as never, svc as never);
    await expect(g.canActivate(ctx({ accountId: 'a' }))).resolves.toBe(true);
  });
});
