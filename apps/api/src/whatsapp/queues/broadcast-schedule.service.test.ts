import { describe, expect, it, vi } from 'vitest';
import { BroadcastScheduleService } from './broadcast-schedule.service';

type Any = Record<string, unknown>;

function build(opts: {
  due: { id: string; account_id: string }[];
  claim?: number;
  pending: { id: string; contact_id: string | null }[];
  optedOut?: string[];
}) {
  const updateMany = vi.fn().mockResolvedValue({ count: opts.claim ?? 1 });
  const update = vi.fn().mockResolvedValue({});
  const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
  const prisma = {
    broadcasts: {
      findMany: vi.fn().mockResolvedValue(opts.due),
      updateMany,
      update,
    },
    broadcast_recipients: {
      findMany: vi.fn().mockResolvedValue(opts.pending),
      deleteMany,
    },
    contacts: {
      findMany: vi
        .fn()
        .mockResolvedValue((opts.optedOut ?? []).map((id) => ({ id }))),
    },
  };
  const queue = { enqueueBroadcast: vi.fn().mockResolvedValue(undefined) };
  const svc = new BroadcastScheduleService(prisma as never, queue as never);
  return { svc, prisma, queue, updateMany, update, deleteMany };
}

describe('BroadcastScheduleService.releaseDue', () => {
  it('claims a due broadcast and enqueues it', async () => {
    const t = build({
      due: [{ id: 'b1', account_id: 'a1' }],
      pending: [{ id: 'r1', contact_id: 'c1' }],
    });
    expect(await t.svc.releaseDue()).toBe(1);
    expect(t.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'b1', status: 'scheduled' },
      data: { status: 'queued' },
    });
    expect(t.queue.enqueueBroadcast).toHaveBeenCalledWith('b1');
  });

  it('does nothing when another instance already claimed it', async () => {
    const t = build({
      due: [{ id: 'b1', account_id: 'a1' }],
      claim: 0,
      pending: [],
    });
    expect(await t.svc.releaseDue()).toBe(0);
    expect(t.queue.enqueueBroadcast).not.toHaveBeenCalled();
  });

  it('drops recipients who opted out after scheduling', async () => {
    const t = build({
      due: [{ id: 'b1', account_id: 'a1' }],
      pending: [
        { id: 'r1', contact_id: 'c1' },
        { id: 'r2', contact_id: 'c2' },
      ],
      optedOut: ['c2'],
    });
    expect(await t.svc.releaseDue()).toBe(1);
    expect(t.deleteMany.mock.calls[0][0]).toMatchObject({
      where: { contact_id: { in: ['c2'] } },
    });
    expect((t.update.mock.calls[0][0] as Any).data).toMatchObject({
      total_recipients: 1,
    });
  });

  it('cancels instead of sending when everyone opted out', async () => {
    const t = build({
      due: [{ id: 'b1', account_id: 'a1' }],
      pending: [{ id: 'r1', contact_id: 'c1' }],
      optedOut: ['c1'],
    });
    expect(await t.svc.releaseDue()).toBe(0);
    expect((t.update.mock.calls[0][0] as Any).data).toMatchObject({
      status: 'cancelled',
    });
    expect(t.queue.enqueueBroadcast).not.toHaveBeenCalled();
  });
});

describe('BroadcastScheduleService.cancel', () => {
  it('only cancels a still-scheduled broadcast of this account', async () => {
    const t = build({ due: [], pending: [] });
    expect(await t.svc.cancel('a1', 'b1')).toBe(true);
    expect(t.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'b1', account_id: 'a1', status: 'scheduled' },
    });
  });

  it('reports false once it has started', async () => {
    const t = build({ due: [], pending: [], claim: 0 });
    expect(await t.svc.cancel('a1', 'b1')).toBe(false);
  });
});
