import { describe, expect, it, vi } from 'vitest';
import { BlockedAddressError, pinnedRequest } from './pinned-http';

describe('pinnedRequest', () => {
  const base = { timeoutMs: 2000 };

  it('refuses literal non-public hosts without resolving', async () => {
    const resolver = vi.fn();
    for (const u of [
      'http://127.0.0.1:9/',
      'http://[::ffff:7f00:1]:9/',
      'http://localhost:9/',
      'http://metadata.google.internal/',
    ]) {
      await expect(
        pinnedRequest({ ...base, url: new URL(u), resolver }),
      ).rejects.toBeInstanceOf(BlockedAddressError);
    }
    expect(resolver).not.toHaveBeenCalled();
  });

  it('re-validates the address the socket is about to dial (rebinding)', async () => {
    const resolver = vi.fn().mockResolvedValue([
      { address: '8.8.8.8', family: 4 },
      { address: '::ffff:a9fe:a9fe', family: 6 },
    ]);
    await expect(
      pinnedRequest({ ...base, url: new URL('http://rebind.example.com/'), resolver }),
    ).rejects.toBeInstanceOf(BlockedAddressError);
    expect(resolver).toHaveBeenCalledWith('rebind.example.com');
  });

  it('refuses a name resolving to loopback', async () => {
    const resolver = vi
      .fn()
      .mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    await expect(
      pinnedRequest({ ...base, url: new URL('https://x.example.com/'), resolver }),
    ).rejects.toBeInstanceOf(BlockedAddressError);
  });

  it('refuses non-http schemes', async () => {
    await expect(
      pinnedRequest({ ...base, url: new URL('file:///etc/passwd') }),
    ).rejects.toBeInstanceOf(BlockedAddressError);
  });
});
