import { describe, expect, it, vi } from 'vitest';
import { WhatsappWebhookService } from './whatsapp-webhook.service';

vi.mock('../../common/security/encryption.util', () => ({
  decrypt: vi.fn((v) => v),
  encrypt: vi.fn((v) => v),
  isLegacyFormat: vi.fn(() => false),
}));

describe('webhook delivery resilience', () => {
  it('keeps processing later entries/changes after a malformed one', async () => {
    const prisma = {
      whatsapp_config: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const svc = new WhatsappWebhookService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const body = {
      entry: [
        { id: 'e0' }, // no changes at all
        {
          id: 'e1',
          changes: [
            // messages present, metadata missing
            { field: 'messages', value: { messages: [{}], contacts: [{}] } },
            // well-formed: must still reach the config lookup
            {
              field: 'messages',
              value: {
                messages: [{}],
                contacts: [{}],
                metadata: { phone_number_id: 'pn1' },
              },
            },
          ],
        },
      ],
    };
    await (svc as any).processWebhook(body);
    expect(prisma.whatsapp_config.findMany).toHaveBeenCalledTimes(1);
  });
});
