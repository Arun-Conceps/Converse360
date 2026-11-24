import { describe, expect, it } from 'vitest';

import { safeRedirectTarget } from './redirect';

describe('safeRedirectTarget', () => {
  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    '  javascript:alert(1)',
    '\n\tjavascript:alert(1)',
    'java\nscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:x',
    '//evil.test',
    '/local',
    'https://u:p@evil.test',
    'https://' + 'a'.repeat(3000),
    '',
  ])('refuses %j', (v) => {
    expect(safeRedirectTarget(v)).toBeNull();
  });

  it('refuses non-strings', () => {
    expect(safeRedirectTarget(null)).toBeNull();
    expect(safeRedirectTarget(1)).toBeNull();
  });

  it('allows http and https', () => {
    expect(safeRedirectTarget('https://example.com/a?b=1')).toBe(
      'https://example.com/a?b=1',
    );
    expect(safeRedirectTarget('http://example.com')).toBe('http://example.com/');
  });
});
