import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingController } from './onboarding.controller';

const svc = { selectPlan: vi.fn(), submitEnquiry: vi.fn() };
const ctl = new OnboardingController(svc as never);
const ctx = (role: string) =>
  ({ accountId: 'a', userId: 'u', role }) as never;

describe('OnboardingController plan mutation is owner-only', () => {
  it.each(['admin', 'agent', 'member'])('%s cannot select a plan', async (r) => {
    await expect(ctl.selectPlan(ctx(r), { planName: 'STARTER' } as never)).rejects.toBeInstanceOf(ForbiddenException);
    expect(svc.selectPlan).not.toHaveBeenCalled();
  });
  it('admin cannot submit an enquiry', async () => {
    await expect(ctl.submitEnquiry(ctx('admin'), {} as never)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('owner can', async () => {
    await ctl.selectPlan(ctx('owner'), { planName: 'STARTER' } as never);
    expect(svc.selectPlan).toHaveBeenCalled();
  });
});
