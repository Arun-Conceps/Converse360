import { describe, expect, it, vi } from 'vitest';
import {
  applyOptKeyword,
  classifyOptKeyword,
  excludeOptedOut,
} from './contact-opt-out';

describe('classifyOptKeyword', () => {
  it.each([
    'STOP',
    'stop',
    ' Stop. ',
    'STOP!',
    'Unsubscribe',
    'stop all',
    'opt out',
    'QUIT',
  ])('opts out on %j', (t) => expect(classifyOptKeyword(t)).toBe('opt_out'));

  it.each(['START', 'start', 'Unstop', 'subscribe', 'opt in'])(
    'opts back in on %j',
    (t) => expect(classifyOptKeyword(t)).toBe('opt_in'),
  );

  // The costly mistake is a false positive: a support message silently
  // removing somebody from every campaign.
  it.each([
    'please stop sending the wrong size',
    "don't stop",
    'I want to cancel my order',
    'end',
    'cancel',
    'stopping by tomorrow',
    'hello',
    '',
    '   ',
  ])('ignores %j', (t) => expect(classifyOptKeyword(t)).toBeNull());

  it('ignores null and undefined', () => {
    expect(classifyOptKeyword(null)).toBeNull();
    expect(classifyOptKeyword(undefined)).toBeNull();
  });
});

describe('applyOptKeyword', () => {
  it('scopes the update to the account and reports whether anything changed', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const changed = await applyOptKeyword(
      { contacts: { updateMany } } as never,
      'acc-1',
      'c-1',
      'opt_out',
    );
    expect(changed).toBe(true);
    const arg = updateMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      data: { opt_out_source: string; opted_out_at: unknown };
    };
    expect(arg.where).toMatchObject({ id: 'c-1', account_id: 'acc-1' });
    expect(arg.data.opt_out_source).toBe('keyword');
    expect(arg.data.opted_out_at).toBeInstanceOf(Date);
  });

  it('clears both columns together on opt-in (the DB checks they pair up)', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const changed = await applyOptKeyword(
      { contacts: { updateMany } } as never,
      'acc-1',
      'c-1',
      'opt_in',
    );
    expect(changed).toBe(false);
    expect((updateMany.mock.calls[0][0] as { data: unknown }).data).toEqual({
      opted_out_at: null,
      opt_out_source: null,
    });
  });
});

describe('excludeOptedOut', () => {
  it('removes opted-out contacts and keeps order', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'b' }]);
    const out = await excludeOptedOut(
      { contacts: { findMany } } as never,
      'acc-1',
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    );
    expect(out.map((c) => c.id)).toEqual(['a', 'c']);
    expect(
      (findMany.mock.calls[0][0] as { where: { account_id: string } }).where
        .account_id,
    ).toBe('acc-1');
  });

  it('does not query for an empty audience', async () => {
    const findMany = vi.fn();
    await excludeOptedOut({ contacts: { findMany } } as never, 'acc-1', []);
    expect(findMany).not.toHaveBeenCalled();
  });
});
