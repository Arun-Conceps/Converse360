import { afterEach, describe, expect, it } from 'vitest';
import {
  isOwnWebMediaUrl,
  matchesMagicBytes,
  WebMediaService,
} from './web-media.service';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const PDF = Buffer.from('%PDF-1.7 hello');

describe('matchesMagicBytes', () => {
  it('accepts matching signatures', () => {
    expect(matchesMagicBytes('image/png', PNG)).toBe(true);
    expect(matchesMagicBytes('application/pdf', PDF)).toBe(true);
    expect(matchesMagicBytes('text/plain', Buffer.from('hi'))).toBe(true);
  });
  it('rejects mismatches', () => {
    expect(matchesMagicBytes('image/png', PDF)).toBe(false);
    expect(matchesMagicBytes('application/pdf', Buffer.from('<html>'))).toBe(false);
    expect(matchesMagicBytes('text/plain', Buffer.from([0x68, 0, 0x69]))).toBe(false);
  });
});

describe('WebMediaService.upload', () => {
  it('rejects a spoofed content type before touching storage', async () => {
    const svc = new WebMediaService();
    await expect(
      svc.upload({
        accountId: 'a',
        conversationId: 'c',
        filename: 'x.png',
        contentType: 'image/png',
        bytes: Buffer.from('<script>alert(1)</script>'),
      }),
    ).rejects.toThrow(/does not look like/);
  });
});

describe('isOwnWebMediaUrl', () => {
  const old = process.env.SUPABASE_URL;
  afterEach(() => {
    process.env.SUPABASE_URL = old;
  });
  const base = 'https://x.supabase.co/storage/v1/object/public/web-media';

  it('accepts only files under the caller account and conversation', () => {
    process.env.SUPABASE_URL = 'https://x.supabase.co/';
    expect(isOwnWebMediaUrl(`${base}/acc/conv/abc-123.png`, 'acc', 'conv')).toBe(true);
    expect(isOwnWebMediaUrl(`${base}/other/conv/abc.png`, 'acc', 'conv')).toBe(false);
    expect(isOwnWebMediaUrl(`${base}/acc/conv/../x.png`, 'acc', 'conv')).toBe(false);
    expect(isOwnWebMediaUrl(`${base}/acc/conv/a.png?x=1`, 'acc', 'conv')).toBe(false);
    expect(isOwnWebMediaUrl('https://evil.test/a.png', 'acc', 'conv')).toBe(false);
  });
});
