import { describe, it, expect, vi } from 'vitest';
import {
  accountRealtimeFilter,
  createConversationScopeCache,
  rowBelongsToWorkspace,
} from './realtime-scope';

describe('rowBelongsToWorkspace', () => {
  it('accepts only a matching account_id', () => {
    expect(rowBelongsToWorkspace({ account_id: 'A' }, 'A')).toBe(true);
    expect(rowBelongsToWorkspace({ account_id: 'B' }, 'A')).toBe(false);
  });
  it('rejects missing account_id, missing row or unresolved workspace', () => {
    expect(rowBelongsToWorkspace({}, 'A')).toBe(false);
    expect(rowBelongsToWorkspace(null, 'A')).toBe(false);
    expect(rowBelongsToWorkspace({ account_id: 'A' }, null)).toBe(false);
  });
});

describe('accountRealtimeFilter', () => {
  it('builds the postgres_changes filter', () => {
    expect(accountRealtimeFilter('abc')).toBe('account_id=eq.abc');
  });
});

describe('createConversationScopeCache', () => {
  it('looks a conversation up once and caches the verdict', async () => {
    const lookup = vi.fn(async (id: string) => ({
      account_id: id === 'c1' ? 'A' : 'B',
    }));
    const cache = createConversationScopeCache('A', lookup);
    expect(await cache.isOwn('c1')).toBe(true);
    expect(await cache.isOwn('c1')).toBe(true);
    expect(await cache.isOwn('c2')).toBe(false);
    expect(await cache.isOwn('c2')).toBe(false);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('treats unknown rows and errors as not ours, without caching errors', async () => {
    const lookup = vi
      .fn()
      .mockRejectedValueOnce(new Error('net'))
      .mockResolvedValueOnce({ account_id: 'A' });
    const cache = createConversationScopeCache('A', lookup);
    expect(await cache.isOwn('c')).toBe(false);
    expect(await cache.isOwn('c')).toBe(true);
    expect(
      await createConversationScopeCache('A', async () => null).isOwn('x'),
    ).toBe(false);
    expect(await cache.isOwn(undefined)).toBe(false);
  });

  it('markOwn skips the lookup', async () => {
    const lookup = vi.fn();
    const cache = createConversationScopeCache('A', lookup);
    cache.markOwn('c');
    expect(await cache.isOwn('c')).toBe(true);
    expect(lookup).not.toHaveBeenCalled();
  });
});
