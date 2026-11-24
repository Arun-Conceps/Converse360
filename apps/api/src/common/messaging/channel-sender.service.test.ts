import { describe, expect, it, vi } from 'vitest';
import {
  ChannelSenderService,
  SendNotAllowedError,
} from './channel-sender.service';
import { EntitlementService } from '../../subscription/services/entitlement.service';

function make(check: { allowed: boolean; reason: string }) {
  const prisma = {
    conversations: {
      findFirst: vi.fn().mockResolvedValue({ channel: 'whatsapp' }),
    },
  };
  const whatsapp = {
    sendText: vi.fn().mockResolvedValue({ whatsapp_message_id: 'wamid.1' }),
  };
  const entitlements = {
    checkLimit: vi.fn().mockResolvedValue({
      currentUsage: 10,
      limitValue: 10,
      standing: 'good',
      ...check,
    }),
    recordUsage: vi.fn().mockResolvedValue(undefined),
    refusalMessage: EntitlementService.prototype.refusalMessage,
  };
  const service = new ChannelSenderService(
    prisma as never,
    whatsapp as never,
    {} as never,
    {} as never,
    entitlements as never,
  );
  return { service, whatsapp, entitlements };
}

const ARGS = {
  accountId: 'acc-1',
  conversationId: 'conv-1',
  contactId: 'c-1',
  text: 'hi',
};

describe('ChannelSenderService metering', () => {
  it('checks the plan, sends, then records one message', async () => {
    const { service, whatsapp, entitlements } = make({
      allowed: true,
      reason: 'ok',
    });
    const out = await service.sendText(ARGS);
    expect(out.messageId).toBe('wamid.1');
    expect(entitlements.checkLimit).toHaveBeenCalledWith(
      'acc-1',
      'messages',
      1,
    );
    expect(whatsapp.sendText).toHaveBeenCalledTimes(1);
    expect(entitlements.recordUsage).toHaveBeenCalledWith('acc-1', 'messages');
  });

  it('refuses a lapsed workspace without sending or counting', async () => {
    const { service, whatsapp, entitlements } = make({
      allowed: false,
      reason: 'subscription_lapsed',
    });
    await expect(service.sendText(ARGS)).rejects.toBeInstanceOf(
      SendNotAllowedError,
    );
    expect(whatsapp.sendText).not.toHaveBeenCalled();
    expect(entitlements.recordUsage).not.toHaveBeenCalled();
  });

  it('refuses an over-quota workspace', async () => {
    const { service, whatsapp } = make({
      allowed: false,
      reason: 'limit_reached',
    });
    await expect(service.sendText(ARGS)).rejects.toThrow(/10 of 10/);
    expect(whatsapp.sendText).not.toHaveBeenCalled();
  });

  it('skipMetering bypasses both the check and the count', async () => {
    const { service, entitlements } = make({
      allowed: false,
      reason: 'limit_reached',
    });
    await service.sendText({ ...ARGS, skipMetering: true });
    expect(entitlements.checkLimit).not.toHaveBeenCalled();
    expect(entitlements.recordUsage).not.toHaveBeenCalled();
  });

  it('does not count a send that threw', async () => {
    const { service, whatsapp, entitlements } = make({
      allowed: true,
      reason: 'ok',
    });
    whatsapp.sendText.mockRejectedValue(new Error('meta down'));
    await expect(service.sendText(ARGS)).rejects.toThrow('meta down');
    expect(entitlements.recordUsage).not.toHaveBeenCalled();
  });

  it('metered() guards template/product sends the same way', async () => {
    const { service, entitlements } = make({ allowed: true, reason: 'ok' });
    const fn = vi.fn().mockResolvedValue('x');
    await service.metered('acc-1', fn);
    expect(fn).toHaveBeenCalled();
    expect(entitlements.recordUsage).toHaveBeenCalledTimes(1);
  });
});
