import { describe, expect, it } from 'vitest';
import { normalizeWebhookUrl } from './webhooks.util';

describe('normalizeWebhookUrl', () => {
  it('accepts public https URLs', () => {
    expect(normalizeWebhookUrl('https://example.com/hook')).toBe(
      'https://example.com/hook',
    );
    expect(normalizeWebhookUrl('https://[2606:4700:4700::1111]/h')).not.toBeNull();
  });
  it.each([
    'http://example.com/h',
    'https://127.0.0.1/h',
    'https://[::1]/h',
    'https://[::ffff:7f00:1]/h',
    'https://[::ffff:127.0.0.1]/h',
    'https://[::ffff:a9fe:a9fe]/h',
    'https://[64:ff9b::7f00:1]/h',
    'https://[2002:7f00:1::]/h',
    'https://[fec0::1]/h',
    'https://169.254.169.254/h',
    'https://10.1.2.3/h',
    'https://192.0.0.1/h',
    'https://198.18.0.1/h',
    'https://localhost/h',
    'https://metadata.google.internal/h',
    'https://user:pw@example.com/h',
    'https://0x7f.1/h',
    'not a url',
  ])('rejects %s', (u) => {
    expect(normalizeWebhookUrl(u)).toBeNull();
  });
  it('rejects non-strings', () => {
    expect(normalizeWebhookUrl(undefined)).toBeNull();
    expect(normalizeWebhookUrl(5)).toBeNull();
  });
});
