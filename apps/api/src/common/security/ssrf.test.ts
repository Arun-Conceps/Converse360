import { describe, expect, it, vi } from 'vitest';
import { lookup } from 'node:dns/promises';
import {
  isDeliverableUrl,
  isPrivateOrReservedIp,
  isPublicLiteralOrName,
} from './ssrf.util';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));

describe('isPrivateOrReservedIp', () => {
  it('flags loopback', () => {
    expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('::1')).toBe(true);
  });

  it('flags the cloud metadata address', () => {
    expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true);
  });

  it('flags RFC1918 private ranges', () => {
    expect(isPrivateOrReservedIp('10.0.0.5')).toBe(true);
    expect(isPrivateOrReservedIp('172.16.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('172.31.255.255')).toBe(true);
    expect(isPrivateOrReservedIp('192.168.1.1')).toBe(true);
  });

  it('does not flag a public IPv4 address', () => {
    expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false);
    expect(isPrivateOrReservedIp('1.1.1.1')).toBe(false);
  });

  it('flags CGNAT range', () => {
    expect(isPrivateOrReservedIp('100.64.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('100.127.0.1')).toBe(true);
  });

  it('flags IPv6 link-local and ULA', () => {
    expect(isPrivateOrReservedIp('fe80::1')).toBe(true);
    expect(isPrivateOrReservedIp('fc00::1')).toBe(true);
    expect(isPrivateOrReservedIp('fd00::1')).toBe(true);
  });

  it('flags IPv4-mapped IPv6 private addresses', () => {
    expect(isPrivateOrReservedIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('::ffff:10.0.0.1')).toBe(true);
  });

  it('does not flag a public IPv6 address', () => {
    expect(isPrivateOrReservedIp('2606:4700:4700::1111')).toBe(false);
  });
});

describe('isDeliverableUrl', () => {
  it('rejects a malformed URL', async () => {
    expect(await isDeliverableUrl('not a url')).toBe(false);
  });

  it('rejects a literal private IP', async () => {
    expect(await isDeliverableUrl('http://127.0.0.1/hook')).toBe(false);
  });

  it('rejects the cloud metadata IP (regression: GHSA-8jqh-598v-rfxc)', async () => {
    expect(
      await isDeliverableUrl('http://169.254.169.254/latest/meta-data'),
    ).toBe(false);
  });

  it('rejects localhost and *.local/*.internal names', async () => {
    expect(await isDeliverableUrl('http://localhost/hook')).toBe(false);
    expect(await isDeliverableUrl('http://foo.local/hook')).toBe(false);
    expect(await isDeliverableUrl('http://foo.internal/hook')).toBe(false);
  });

  it('rejects a hostname that resolves only to a private IP', async () => {
    vi.mocked(lookup).mockResolvedValue([
      { address: '10.0.0.5', family: 4 },
    ] as never);
    expect(
      await isDeliverableUrl('http://internal-service.example.com/hook'),
    ).toBe(false);
  });

  it('accepts a literal public IP', async () => {
    expect(await isDeliverableUrl('http://8.8.8.8/hook')).toBe(true);
  });
});

describe('isDeliverableUrl bypass table', () => {
  const bad = [
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:7f00:1]/',
    'http://[::ffff:a9fe:a9fe]/latest/meta-data',
    'http://[0:0:0:0:0:ffff:7f00:1]/',
    'http://[::FFFF:7F00:1]/',
    'http://[64:ff9b::7f00:1]/',
    'http://[64:ff9b::169.254.169.254]/',
    'http://[2002:7f00:1::]/',
    'http://[2002:a9fe:a9fe::]/',
    'http://[::7f00:1]/',
    'http://[fec0::1]/',
    'http://[fd00::1]/',
    'http://192.0.0.1/',
    'http://198.18.0.1/',
    'http://198.19.5.5/',
    'http://224.0.0.1/',
    'http://240.0.0.1/',
    'http://255.255.255.255/',
    'http://100.64.0.1/',
    'http://0x7f.1/',
    'http://2130706433/',
    'http://metadata.google.internal/computeMetadata/v1/',
    'http://localhost./',
    'ftp://example.com/',
    'http://user:pw@8.8.8.8/',
  ];
  it.each(bad)('rejects %s', async (u) => {
    expect(await isDeliverableUrl(u)).toBe(false);
  });

  it('accepts public literals incl. mapped public v4', async () => {
    expect(await isDeliverableUrl('https://[2606:4700:4700::1111]/')).toBe(true);
    expect(await isDeliverableUrl('https://[::ffff:8.8.8.8]/')).toBe(true);
  });

  it('rejects a name resolving to a hex-mapped loopback', async () => {
    vi.mocked(lookup).mockResolvedValue([
      { address: '::ffff:7f00:1', family: 6 },
    ] as never);
    expect(await isDeliverableUrl('http://rebind.example.com/')).toBe(false);
  });

  it('rejects when ANY resolved address is private', async () => {
    vi.mocked(lookup).mockResolvedValue([
      { address: '8.8.8.8', family: 4 },
      { address: '64:ff9b::a00:1', family: 6 },
    ] as never);
    expect(await isDeliverableUrl('http://mixed.example.com/')).toBe(false);
  });
});

describe('isPublicLiteralOrName', () => {
  it('is DNS-free and screens literals and names', () => {
    expect(isPublicLiteralOrName('https://example.com/h')).toBe(true);
    expect(isPublicLiteralOrName('https://[::ffff:7f00:1]/h')).toBe(false);
    expect(isPublicLiteralOrName('https://localhost/h')).toBe(false);
    expect(isPublicLiteralOrName('nope')).toBe(false);
  });
});
