import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import { RazorpayController } from './razorpay.controller';

// The controller re-reads the order and payment from Razorpay itself.
const rzpMock = vi.hoisted(() => ({
  ordersFetch: vi.fn(),
  paymentsFetch: vi.fn(),
  ordersCreate: vi.fn(),
}));
vi.mock('razorpay', () => ({
  default: class {
    orders = { fetch: rzpMock.ordersFetch, create: rzpMock.ordersCreate };
    payments = { fetch: rzpMock.paymentsFetch };
  },
}));
import type { PrismaService } from '../../prisma/prisma.service';
import type { SupabaseAccountContext } from '../../auth/types/account-context.type';

/**
 * Three things are pinned here, and each one shipped broken:
 *
 *   1. The HMAC signature is the ONLY thing separating "I paid" from a
 *      claim any signed-in user can POST. Without it this endpoint is a
 *      free upgrade — and, now that the trial-ended screen routes here, a
 *      free unlock of a locked workspace.
 *   2. A payment must not grant a TRIAL. It used to write
 *      `status = 'trial'` plus a fresh 15-day window whenever the plan had
 *      trial_days, which every selectable plan does: the customer paid and
 *      was recorded as still trialling, then lapsed again a fortnight
 *      later, and migration 074's one-trial latch was bypassed entirely.
 *   3. The write must land on the OWNER's row. Entitlement resolves
 *      through `accounts.owner_user_id`, so a payment filed against the
 *      caller left the workspace locked and the money collected.
 */

const KEY_SECRET = 'test_secret_do_not_use';

/** A genuine, captured, freshly-created STARTER monthly payment. */
function mockGateway(
  order: Record<string, unknown> = {},
  payment: Record<string, unknown> = {},
) {
  rzpMock.ordersFetch.mockReset().mockResolvedValue({
    id: ORDER,
    amount: 30000,
    amount_paid: 30000,
    notes: { userId: 'owner-1', planName: 'STARTER', billingCycle: 'monthly' },
    ...order,
  });
  rzpMock.paymentsFetch.mockReset().mockResolvedValue({
    id: PAYMENT,
    order_id: ORDER,
    status: 'captured',
    amount: 30000,
    created_at: Math.floor(Date.now() / 1000) - 30,
    ...payment,
  });
}

function makePrismaMock() {
  return {
    account: { findUnique: vi.fn() },
    subscription_plans: { findUnique: vi.fn() },
    user_subscriptions: {
      upsert: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };
}

/** Razorpay signs `<order_id>|<payment_id>` with the key secret. */
function sign(orderId: string, paymentId: string, secret = KEY_SECRET): string {
  return createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

const ORDER = 'order_TQiCDAwBY8u63y';
const PAYMENT = 'pay_abc123';

/** The caller is the owner here; the wrong-row test overrides the account. */
const ACCOUNT: SupabaseAccountContext = {
  authType: 'supabase',
  userId: 'owner-1',
  accountId: 'acc-1',
  role: 'owner',
  account: { id: 'acc-1', name: 'Acme' },
};

interface UpsertCall {
  where: Record<string, unknown>;
  create: Record<string, unknown>;
  update: Record<string, unknown>;
}

describe('RazorpayController.confirmPayment', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let controller: RazorpayController;

  beforeEach(() => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
    process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;

    prisma = makePrismaMock();
    prisma.account.findUnique.mockResolvedValue({ ownerUserId: 'owner-1' });
    prisma.subscription_plans.findUnique.mockResolvedValue({
      id: 'plan-starter',
      price_monthly: 300,
      price_yearly: 3000,
    });
    mockGateway();

    controller = new RazorpayController(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
  });

  function body(overrides: Record<string, unknown> = {}) {
    return {
      planName: 'STARTER',
      billingCycle: 'monthly',
      razorpayOrderId: ORDER,
      razorpayPaymentId: PAYMENT,
      razorpaySignature: sign(ORDER, PAYMENT),
      ...overrides,
    };
  }

  it('refuses a signature it did not sign, and writes nothing', async () => {
    await expect(
      controller.confirmPayment(
        ACCOUNT,
        body({ razorpaySignature: 'a'.repeat(64) }),
      ),
    ).rejects.toThrow(HttpException);

    expect(prisma.user_subscriptions.upsert).not.toHaveBeenCalled();
  });

  /**
   * The signature covers the order and payment ids, so swapping either one
   * after the fact has to fail — otherwise a ₹300 Starter payment could be
   * replayed against a Growth order.
   */
  it('refuses a signature minted for a different order', async () => {
    await expect(
      controller.confirmPayment(
        ACCOUNT,
        body({ razorpaySignature: sign('order_someone_else', PAYMENT) }),
      ),
    ).rejects.toThrow(HttpException);

    expect(prisma.user_subscriptions.upsert).not.toHaveBeenCalled();
  });

  it('refuses a signature signed with the wrong secret', async () => {
    await expect(
      controller.confirmPayment(
        ACCOUNT,
        body({ razorpaySignature: sign(ORDER, PAYMENT, 'not_our_secret') }),
      ),
    ).rejects.toThrow(HttpException);

    expect(prisma.user_subscriptions.upsert).not.toHaveBeenCalled();
  });

  it('refuses a missing signature rather than treating it as absent-and-fine', async () => {
    await expect(
      controller.confirmPayment(
        ACCOUNT,
        body({ razorpaySignature: undefined }),
      ),
    ).rejects.toThrow(/Missing required fields/);

    expect(prisma.user_subscriptions.upsert).not.toHaveBeenCalled();
  });

  it('lands active on a verified payment', async () => {
    const result = await controller.confirmPayment(ACCOUNT, body());

    expect(result).toEqual({ success: true, planName: 'STARTER' });

    const call = prisma.user_subscriptions.upsert.mock
      .calls[0][0] as UpsertCall;
    expect(call.update.status).toBe('active');
    expect(call.update.payment_method).toBe('razorpay');
    expect(call.update.razorpay_subscription_id).toBe(ORDER);
  });

  /**
   * ⚠️ Paying must not buy a trial. The trial columns are the historical
   * record of the one trial this workspace already had (migration 074);
   * rewriting them here granted a second one and left a paying customer
   * recorded as `trial`, invisible to MRR.
   */
  it('never writes the trial columns when converting an existing row', async () => {
    await controller.confirmPayment(ACCOUNT, body());

    const call = prisma.user_subscriptions.upsert.mock
      .calls[0][0] as UpsertCall;
    expect(call.update).not.toHaveProperty('trial_start_at');
    expect(call.update).not.toHaveProperty('trial_end_at');
    expect(call.update.status).not.toBe('trial');
  });

  /** The billing period starts when it is paid for, not when a trial ends. */
  it('starts the paid period today', async () => {
    await controller.confirmPayment(ACCOUNT, body());

    const call = prisma.user_subscriptions.upsert.mock
      .calls[0][0] as UpsertCall;
    const start = call.update.current_period_start as Date;
    const end = call.update.current_period_end as Date;

    expect(Math.abs(start.getTime() - Date.now())).toBeLessThan(60_000);
    expect(end.getTime()).toBeGreaterThan(start.getTime());
  });

  it('bills a year ahead on the yearly cycle', async () => {
    mockGateway({
      amount: 300000,
      amount_paid: 300000,
      notes: { userId: 'owner-1', planName: 'STARTER', billingCycle: 'yearly' },
    }, { amount: 300000 });
    await controller.confirmPayment(ACCOUNT, body({ billingCycle: 'yearly' }));

    const call = prisma.user_subscriptions.upsert.mock
      .calls[0][0] as UpsertCall;
    const start = call.update.current_period_start as Date;
    const end = call.update.current_period_end as Date;

    const months =
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth());
    expect(months).toBe(12);
  });

  /**
   * ⚠️ The row that IS the workspace's entitlement belongs to
   * `accounts.owner_user_id`. `RequireRole('owner')` should mean the caller
   * and the owner are the same person, but the write resolves the owner
   * itself so a stale profile role cannot misfile a payment.
   */
  it('writes the owner subscription, not the caller', async () => {
    prisma.account.findUnique.mockResolvedValue({ ownerUserId: 'owner-1' });

    await controller.confirmPayment({ ...ACCOUNT, userId: 'admin-7' }, body());

    const call = prisma.user_subscriptions.upsert.mock
      .calls[0][0] as UpsertCall;
    expect(call.where).toEqual({ user_id: 'owner-1' });
    expect(call.create.user_id).toBe('owner-1');
  });

  it('rejects a plan name that is not sold self-serve', async () => {
    await expect(
      controller.confirmPayment(ACCOUNT, body({ planName: 'ENTERPRISE' })),
    ).rejects.toThrow(/Invalid plan name/);

    expect(prisma.user_subscriptions.upsert).not.toHaveBeenCalled();
  });

  describe('binding to the real order (H-1)', () => {
    async function expectRejected(
      b: Record<string, unknown> = {},
      match?: RegExp | string,
    ) {
      const p = controller.confirmPayment(ACCOUNT, body(b));
      await expect(p).rejects.toThrow(match as never);
      expect(prisma.user_subscriptions.upsert).not.toHaveBeenCalled();
    }

    it('rejects a payment that was not captured', async () => {
      mockGateway({}, { status: 'authorized' });
      await expectRejected();
    });

    it('rejects an order that is not fully paid', async () => {
      mockGateway({ amount_paid: 0 });
      await expectRejected();
    });

    it('rejects a payment belonging to a different order', async () => {
      mockGateway({}, { order_id: 'order_other' });
      await expectRejected();
    });

    it('rejects relabelling a Starter payment as Growth', async () => {
      prisma.subscription_plans.findUnique.mockResolvedValue({
        id: 'plan-growth',
        price_monthly: 900,
        price_yearly: 9000,
      });
      await expectRejected({ planName: 'GROWTH' });
    });

    it('rejects relabelling a monthly payment as yearly', async () => {
      await expectRejected({ billingCycle: 'yearly' });
    });

    it('rejects an order created by someone else', async () => {
      mockGateway({
        notes: { userId: 'attacker', planName: 'STARTER', billingCycle: 'monthly' },
      });
      await expectRejected();
    });

    it('rejects an AI-credit order passed off as a plan payment', async () => {
      mockGateway({
        notes: {
          kind: 'ai_credits',
          userId: 'owner-1',
          planName: 'STARTER',
          billingCycle: 'monthly',
        },
      });
      await expectRejected();
    });

    it('rejects when the order amount is not the current plan price', async () => {
      prisma.subscription_plans.findUnique.mockResolvedValue({
        id: 'plan-starter',
        price_monthly: 500,
        price_yearly: 5000,
      });
      await expectRejected();
    });

    it('rejects a stale payment (replay of an old triple)', async () => {
      mockGateway({}, { created_at: Math.floor(Date.now() / 1000) - 3 * 3600 });
      await expectRejected();
    });

    it('is idempotent: the same order already applied is a no-op', async () => {
      prisma.user_subscriptions.findUnique.mockResolvedValue({
        razorpay_subscription_id: ORDER,
        status: 'active',
      });
      await expect(controller.confirmPayment(ACCOUNT, body())).resolves.toEqual({
        success: true,
        planName: 'STARTER',
      });
      expect(prisma.user_subscriptions.upsert).not.toHaveBeenCalled();
    });

    it('refuses an order already applied to another subscription row', async () => {
      prisma.user_subscriptions.findFirst.mockResolvedValue({ user_id: 'x' });
      await expectRejected();
    });

    it('create-order rejects a billing cycle that is not monthly|yearly', async () => {
      await expect(
        controller.createOrder(ACCOUNT, { planName: 'STARTER', billingCycle: 'weekly' }),
      ).rejects.toThrow(/Invalid billing cycle/);
      expect(rzpMock.ordersCreate).not.toHaveBeenCalled();
    });
  });
});
