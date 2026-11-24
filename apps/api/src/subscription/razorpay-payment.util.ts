import { HttpException, HttpStatus } from '@nestjs/common';

/** The only billing cycles a plan order may carry. */
export const BILLING_CYCLES = ['monthly', 'yearly'] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export function isBillingCycle(v: unknown): v is BillingCycle {
  return v === 'monthly' || v === 'yearly';
}

/** Price of a plan for a cycle, in paise (what Razorpay charges). */
export function expectedAmountPaise(
  plan: { price_monthly: unknown; price_yearly: unknown },
  cycle: BillingCycle,
): number {
  const major =
    cycle === 'monthly'
      ? Number(plan.price_monthly ?? 0)
      : Number(plan.price_yearly ?? 0);
  return Math.round(major * 100);
}

/** A confirm-payment callback fires right after paying. Older = replay. */
export const MAX_CONFIRM_AGE_SECONDS = 2 * 60 * 60;

interface RzpClientLike {
  orders: { fetch(id: string): Promise<any> };
  payments: { fetch(id: string): Promise<any> };
}

function reject(error: string, code: string, status = HttpStatus.BAD_REQUEST) {
  return new HttpException({ error, code }, status);
}

/**
 * Re-reads the order and payment from Razorpay itself and requires that
 * they describe a CAPTURED payment for exactly this order. The HMAC only
 * proves "Razorpay signed this order/payment pair"; it says nothing about
 * what was bought, how much was paid, or whether it is fresh.
 */
export async function fetchCapturedPayment(
  rzp: RzpClientLike,
  orderId: string,
  paymentId: string,
  opts: { maxAgeSeconds?: number } = {},
): Promise<{ order: any; payment: any }> {
  let order: any;
  let payment: any;
  try {
    [order, payment] = await Promise.all([
      rzp.orders.fetch(orderId),
      rzp.payments.fetch(paymentId),
    ]);
  } catch {
    throw reject(
      'Could not verify the payment with the gateway.',
      'gateway_unavailable',
      HttpStatus.BAD_GATEWAY,
    );
  }

  if (!payment || payment.order_id !== orderId) {
    throw reject('Payment does not belong to this order.', 'order_mismatch');
  }
  if (payment.status !== 'captured') {
    throw reject('Payment has not been captured.', 'not_captured');
  }
  if (!order || order.id !== orderId) {
    throw reject('Order not found.', 'order_mismatch');
  }
  if (Number(order.amount_paid) < Number(order.amount)) {
    throw reject('Order is not fully paid.', 'not_paid');
  }
  if (Number(payment.amount) < Number(order.amount)) {
    throw reject('Payment amount does not cover the order.', 'amount_mismatch');
  }
  if (opts.maxAgeSeconds != null) {
    const created = Number(payment.created_at);
    if (
      !Number.isFinite(created) ||
      Date.now() / 1000 - created > opts.maxAgeSeconds
    ) {
      throw reject('This payment is too old to confirm.', 'stale_payment');
    }
  }
  return { order, payment };
}
