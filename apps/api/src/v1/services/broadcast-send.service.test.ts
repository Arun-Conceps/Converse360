import { describe, it, expect, vi } from 'vitest';
import { BroadcastSendService } from './broadcast-send.service';

vi.mock('../../common/phone/account-country.util', () => ({
  resolveAccountCountry: vi.fn(async () => 'IN'),
}));
vi.mock('../../common/contacts/contact-opt-out', () => ({
  optedOutIds: vi.fn(async () => new Set()),
}));

function build(limitAllowed: boolean) {
  const prisma: any = {
    whatsapp_config: { findFirst: vi.fn(async () => ({ id: 'c' })) },
    message_templates: { findFirst: vi.fn(async () => null) },
    contacts: {
      findMany: vi
        .fn()
        .mockResolvedValueOnce([{ id: 'existing-1', phone: '+919876543210' }])
        .mockResolvedValue([{ id: 'new-1', phone: '+919876543211' }]),
      createMany: vi.fn(async () => ({ count: 1 })),
    },
    broadcasts: { create: vi.fn(async () => ({ id: 'b1' })) },
    broadcast_recipients: { createMany: vi.fn(async () => ({})) },
  };
  const entitlements: any = {
    checkLimit: vi.fn(async (_a: string, type: string) =>
      type === 'contacts'
        ? { allowed: limitAllowed, currentUsage: 5, limitValue: 5, reason: 'x' }
        : { allowed: true },
    ),
    refusalMessage: vi.fn(() => 'limit msg'),
    recordUsage: vi.fn(),
  };
  const queue: any = { enqueueBroadcast: vi.fn() };
  const hooks: any = { dispatchWebhookEvent: vi.fn() };
  return {
    prisma,
    entitlements,
    svc: new BroadcastSendService(prisma, hooks, queue, entitlements),
  };
}

const recipients = [
  { to: '+919876543210' },
  { to: '+919876543211' },
  { to: 'nope' },
];

describe('BroadcastSendService contacts limit', () => {
  it('batches creation and checks the contacts limit for new ones only', async () => {
    const { svc, prisma, entitlements } = build(true);
    const r = await svc.createBroadcast('a', 'u', {
      templateName: 't',
      recipients,
    });
    expect(entitlements.checkLimit).toHaveBeenCalledWith('a', 'contacts', 1);
    expect(prisma.contacts.createMany).toHaveBeenCalledTimes(1);
    expect(r.accepted).toBe(2);
    expect(r.rejected).toBe(1);
  });

  it('refuses with 402 and creates nothing when over the limit', async () => {
    const { svc, prisma } = build(false);
    await expect(
      svc.createBroadcast('a', 'u', { templateName: 't', recipients }),
    ).rejects.toMatchObject({ status: 402 });
    expect(prisma.contacts.createMany).not.toHaveBeenCalled();
    expect(prisma.broadcasts.create).not.toHaveBeenCalled();
  });
});
