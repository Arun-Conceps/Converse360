import { describe, expect, it, vi } from 'vitest';
import { AutomationStepExecutorService } from './services/automation-step-executor.service';
import { interpolateUrl } from './services/automation-interpolation.util';
import {
  AutomationsEngineController,
  MANUAL_TRIGGER_TYPES,
} from './automations-engine.controller';
import type { StepExecutionArgs } from './automation.types';

function runner(prisma: unknown) {
  const service = new AutomationStepExecutorService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { startForContact: vi.fn() } as never,
    { run: vi.fn() } as never,
    { add: vi.fn() } as never,
  );
  return (step: { stepType: string; stepConfig: unknown }) =>
    (
      service as unknown as {
        runStep: (
          s: unknown,
          a: StepExecutionArgs,
        ) => Promise<{ detail: string }>;
      }
    ).runStep({ id: 's', position: 0, ...step }, {
      automation: { id: 'a', accountId: 'acc-1', userId: 'u' },
      contactId: 'c-1',
      context: {},
      parentStepId: null,
      branch: null,
      startPosition: 0,
      logId: null,
      triggerEvent: 'x',
    } as StepExecutionArgs);
}

describe('assign_conversation membership check', () => {
  it('skips an agent id that is not a member of the workspace', async () => {
    const prisma = {
      account_members: { findUnique: vi.fn().mockResolvedValue(null) },
      conversations: { updateMany: vi.fn() },
    };
    const res = await runner(prisma)({
      stepType: 'assign_conversation',
      stepConfig: { mode: 'specific', agent_id: 'foreign-user' },
    });
    expect(res.detail).toMatch(/not a member/i);
    expect(prisma.conversations.updateMany).not.toHaveBeenCalled();
    expect(prisma.account_members.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          account_id_user_id: { account_id: 'acc-1', user_id: 'foreign-user' },
        },
      }),
    );
  });

  it('assigns a real member', async () => {
    const prisma = {
      account_members: {
        findUnique: vi.fn().mockResolvedValue({ user_id: 'u-9' }),
      },
      conversations: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const res = await runner(prisma)({
      stepType: 'assign_conversation',
      stepConfig: { mode: 'specific', agent_id: 'u-9' },
    });
    expect(res.detail).toBe('assigned to u-9');
    expect(prisma.conversations.updateMany).toHaveBeenCalled();
  });
});

describe('interpolateUrl', () => {
  const ctx = {
    vars: {
      q: 'a b&role=admin',
      id: '../admin?x=1',
      base: 'https://api.test',
    },
  } as never;

  it('percent-encodes values in path and query', () => {
    expect(
      interpolateUrl('https://api.test/users/{{vars.id}}?q={{vars.q}}', ctx),
    ).toBe('https://api.test/users/..%2Fadmin%3Fx%3D1?q=a%20b%26role%3Dadmin');
  });

  it('leaves scheme and host as authored', () => {
    expect(interpolateUrl('{{vars.base}}/p/{{vars.q}}', ctx)).toBe(
      'https://api.test/p/a%20b%26role%3Dadmin',
    );
  });

  it('does not double-encode a token that already uses urlencode', () => {
    expect(
      interpolateUrl('https://h.test/?q={{vars.q | urlencode}}', ctx),
    ).toBe('https://h.test/?q=a%20b%26role%3Dadmin');
  });

  it('resolves unknown tokens to empty', () => {
    expect(interpolateUrl('https://h.test/{{vars.nope}}x', ctx)).toBe(
      'https://h.test/x',
    );
  });
});

describe('POST /automations/engine', () => {
  it('requires admin and only fires manual trigger types', async () => {
    const dispatch = { dispatch: vi.fn().mockResolvedValue(undefined) };
    const controller = new AutomationsEngineController(dispatch as never);
    const account = { accountId: 'acc-1' } as never;

    await expect(
      controller.trigger(account, {
        trigger_type: 'new_message_received',
        context: { message_text: 'forged' },
      }),
    ).rejects.toThrow(/cannot be fired manually/);
    expect(dispatch.dispatch).not.toHaveBeenCalled();

    await controller.trigger(account, {
      trigger_type: MANUAL_TRIGGER_TYPES[0],
    });
    expect(dispatch.dispatch).toHaveBeenCalledTimes(1);

    // Metadata set by @RequireRole.
    const role = Reflect.getMetadata(
      'requireRole',
      AutomationsEngineController.prototype.trigger,
    );
    expect(role).toBe('admin');
  });
});
