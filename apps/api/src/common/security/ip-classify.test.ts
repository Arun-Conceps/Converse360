import { describe, expect, it } from 'vitest';
import { isBlockedHostname, isBlockedIp, parseIp } from './ip-classify';

const BLOCKED = [
  // loopback / this-network / private / link-local / CGNAT
  '127.0.0.1', '127.255.255.254', '0.0.0.0', '0.1.2.3', '10.0.0.1',
  '172.16.0.1', '172.31.255.255', '192.168.0.1', '169.254.169.254',
  '100.64.0.1', '100.127.255.255',
  // IETF / documentation / benchmark / relay
  '192.0.0.1', '192.0.0.170', '192.0.2.1', '198.51.100.7', '203.0.113.9',
  '198.18.0.1', '198.19.255.255', '192.88.99.1',
  // multicast / reserved / broadcast
  '224.0.0.1', '239.255.255.255', '240.0.0.1', '255.255.255.255',
  // v6 basics
  '::', '::1', '0:0:0:0:0:0:0:1', 'fe80::1', 'fe80::1%eth0', 'FE80::ABCD',
  'febf::1', 'fc00::1', 'fd12:3456::1', 'FD00::1', 'fec0::1', 'feff::1',
  'ff02::1', 'ff00::', '2001:db8::1', '2001:DB8::1', '2001::1', '2001:1::1',
  '3fff::1',
  // IPv4-mapped: dotted, HEX (what WHATWG URL emits), expanded, upper-case
  '::ffff:127.0.0.1', '::ffff:7f00:1', '::FFFF:7F00:1',
  '0:0:0:0:0:ffff:7f00:1', '0000:0000:0000:0000:0000:ffff:7f00:0001',
  '::ffff:a9fe:a9fe', '::ffff:169.254.169.254', '::ffff:a00:1',
  '::ffff:c0a8:1', '::ffff:ac10:1', '::ffff:0.0.0.0', '::ffff:c000:201',
  '::ffff:6440:1', '::ffff:ffff:ffff', '::ffff:e000:1',
  // SIIT
  '::ffff:0:7f00:1',
  // NAT64
  '64:ff9b::7f00:1', '64:ff9b::127.0.0.1', '64:ff9b::a9fe:a9fe',
  '64:ff9b::a00:1', '0064:ff9b:0000:0000:0000:0000:7f00:0001',
  '64:ff9b:1::1',
  // 6to4
  '2002:7f00:1::', '2002:7f00:0001::1', '2002:a9fe:a9fe::1',
  '2002:0a00:0001::', '2002:c0a8:0101::', '2002:ac10::1',
  // v4-compatible
  '::7f00:1', '::127.0.0.1', '::a9fe:a9fe', '::1.2.3.4',
  // bracketed
  '[::1]', '[::ffff:7f00:1]',
];

const ALLOWED = [
  '1.1.1.1', '8.8.8.8', '172.32.0.1', '172.15.255.255', '192.169.0.1',
  '100.63.255.255', '100.128.0.1', '198.17.255.255', '198.20.0.1',
  '223.255.255.255', '192.0.1.1', '203.0.114.1',
  '2606:4700:4700::1111', '2001:4860:4860::8888', '2a00:1450:4009::200e',
  '2002:0808:0808::1', '::ffff:808:808', '::ffff:8.8.8.8',
  '64:ff9b::808:808', '[2606:4700:4700::1111]',
];

const UNPARSEABLE = [
  '', 'example.com', 'localhost', '1.2.3', '1.2.3.4.5', '256.1.1.1',
  '01.2.3.4', '1.2.3.04', '::1::2', '1:2:3:4:5:6:7:8:9', '12345::1',
  ':::', 'g::1', '::ffff:1.2.3', '1:2:3:4:5:6:7', '0x7f.0.0.1', '2130706433',
];

describe('isBlockedIp (shared classifier)', () => {
  it.each(BLOCKED)('blocks %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });
  it.each(ALLOWED)('allows %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(false);
  });
  it.each(UNPARSEABLE)('fails closed on %j', (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });
});

describe('blocked literals stay blocked after WHATWG URL normalisation', () => {
  const urlLiterals = [
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:169.254.169.254]/',
    'http://[0:0:0:0:0:ffff:7f00:1]/',
    'http://[64:ff9b::127.0.0.1]/',
    'http://[2002:7f00:1::]/',
    'http://[::127.0.0.1]/',
    'http://[FEC0::1]/',
    'http://0x7f.1/',
    'http://2130706433/',
    'http://017700000001/',
  ];
  it.each(urlLiterals)('%s', (u) => {
    const host = new URL(u).hostname.replace(/^\[|\]$/g, '');
    expect(isBlockedIp(host), host).toBe(true);
  });
});

describe('parseIp', () => {
  it('parses compressed, embedded and zoned forms to bytes', () => {
    expect(parseIp('::ffff:1.2.3.4')).toEqual({
      family: 6,
      bytes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 1, 2, 3, 4],
    });
    expect(parseIp('fe80::1%en0')?.bytes[0]).toBe(0xfe);
    expect(parseIp('[::1]')?.family).toBe(6);
    expect(parseIp('8.8.8.8')?.family).toBe(4);
  });
});

describe('isBlockedHostname', () => {
  it.each([
    'localhost', 'LOCALHOST', 'localhost.', 'a.localhost', 'foo.local',
    'metadata.google.internal', 'x.internal', 'metadata', 'instance-data',
    'router.home.arpa', 'printer.lan', '',
  ])('blocks %j', (h) => expect(isBlockedHostname(h)).toBe(true));
  it.each(['example.com', 'api.stripe.com', 'internal-docs.example.com'])(
    'allows %s',
    (h) => expect(isBlockedHostname(h)).toBe(false),
  );
});
