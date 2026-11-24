import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiCreditsController } from './ai-credits.controller';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AiCreditsService } from './ai-credits.service';
import type { SupabaseAccountContext } from '../../auth/types/account-context.type';

const rzp = vi.hoisted(() => ({ ordersFetch: vi.fn(), paymentsFetch: vi.fn() }));
vi.mock('razorpay', () => ({
  default: class {
    orders = { fetch: rzp.ordersFetch };
    payments = { fetch: rzp.paymentsFetch };
  },
}));

const SECRET = 'secret_x';
const ORDER = 'order_1';
const PAY = 'pay_1';
const ACCOUNT = {
  authType: 'supabase',
  userId: 'u1',
  accountId: 'acc-1',
  role: 'owner',
  account: { id: 'acc-1', name: 'A' },
} as SupabaseAccountContext;

describe('AiCreditsController.verifyPayment binds to the real order', () => {
  let creditOrder: ReturnType<typeof vi.fn>;
  let controller: AiCreditsController;
  const body = () => ({
    razorpay_order_id: ORDER,
    razorpay_payment_id: PAY,
    razorpay_signature: createHmac('sha256', SECRET)
      .update(`${ORDER}|${PAY}`)
      .digest('hex'),
  });

  beforeEach(() => {
    process.env.RAZORPAY_KEY_ID = 'k';
    process.env.RAZORPAY_KEY_SECRET = SECRET;
    creditOrder = vi.fn().mockResolvedValue(500);
    const prisma = {
      ai_credit_orders: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'row-1',
          credits: 500,
          amount_minor: 49900n,
          currency: 'INR',
        }),
      },
    };
    controller = new AiCreditsController(
      prisma as unknown as PrismaService,
      { creditOrder } as unknown as AiCreditsService,
    );
    rzp.ordersFetch.mockReset().mockResolvedValue({
      id: ORDER,
      amount: 49900,
      amount_paid: 49900,
      currency: 'INR',
      notes: { kind: 'ai_credits', orderId: 'row-1', accountId: 'acc-1' },
    });
    rzp.paymentsFetch.mockReset().mockResolvedValue({
      id: PAY,
      order_id: ORDER,
      status: 'captured',
      amount: 49900,
    });
  });

  it('credits a captured payment that matches our priced row', async () => {
    await expect(controller.verifyPayment(ACCOUNT, body())).resolves.toMatchObject({
      success: true,
    });
    expect(creditOrder).toHaveBeenCalledWith('row-1', PAY);
  });

  it('refuses an uncaptured payment', async () => {
    rzp.paymentsFetch.mockResolvedValue({
      id: PAY,
      order_id: ORDER,
      status: 'authorized',
      amount: 49900,
    });
    await expect(controller.verifyPayment(ACCOUNT, body())).rejects.toThrow();
    expect(creditOrder).not.toHaveBeenCalled();
  });

  it('refuses when Razorpay order amount differs from the priced row', async () => {
    rzp.ordersFetch.mockResolvedValue({
      id: ORDER,
      amount: 100,
      amount_paid: 100,
      currency: 'INR',
      notes: { kind: 'ai_credits', orderId: 'row-1', accountId: 'acc-1' },
    });
    rzp.paymentsFetch.mockResolvedValue({
      id: PAY,
      order_id: ORDER,
      status: 'captured',
      amount: 100,
    });
    await expect(controller.verifyPayment(ACCOUNT, body())).rejects.toThrow();
    expect(creditOrder).not.toHaveBeenCalled();
  });

  it('refuses a plan order (no ai_credits kind) as a credit payment', async () => {
    rzp.ordersFetch.mockResolvedValue({
      id: ORDER,
      amount: 49900,
      amount_paid: 49900,
      currency: 'INR',
      notes: { userId: 'u1', planName: 'STARTER', billingCycle: 'monthly' },
    });
    await expect(controller.verifyPayment(ACCOUNT, body())).rejects.toThrow();
    expect(creditOrder).not.toHaveBeenCalled();
  });
});
