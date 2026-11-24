import { describe, expect, it } from 'vitest';
import { checkRegexSafety, safeRegexTest } from './safe-regex.util';
import { validateStepsForActivation } from './automation-validate';

describe('safe regex', () => {
  it('(a+)+$ against a*50+! returns instantly', () => {
    const t0 = Date.now();
    expect(safeRegexTest('(a+)+$', 'a'.repeat(50) + '!')).toBe(false);
    expect(Date.now() - t0).toBeLessThan(50);
  });

  it.each(['(a|aa)+$', '(a*)*b', '(.*a){5,}', String.raw`(\w+\s?)+$`, String.raw`(a)\1`, '(?=a)a', '(?<!a)b'])(
    'rejects %s',
    (p) => {
      expect(checkRegexSafety(p).ok).toBe(false);
    },
  );

  it('rejects too-long patterns and invalid ones', () => {
    expect(checkRegexSafety('a'.repeat(201)).ok).toBe(false);
    expect(checkRegexSafety('(').ok).toBe(false);
  });

  it.each(['^refund', String.raw`^\d{3}-\d{4}$`, String.raw`^(hi|hello)\b`, String.raw`[a-z]+@[a-z]+\.com`, '(ab)?c', String.raw`^\d+\s*-\d{2}$`])(
    'accepts %s',
    (p) => {
      expect(checkRegexSafety(p).ok).toBe(true);
    },
  );

  it('still matches normally and is stateless', () => {
    expect(safeRegexTest('^refund', 'refund please')).toBe(true);
    expect(safeRegexTest('^refund', 'refund please')).toBe(true);
    expect(safeRegexTest('^refund', 'no')).toBe(false);
  });

  it('truncates very long input and polynomial patterns stay fast', () => {
    const t0 = Date.now();
    safeRegexTest('.*.*.*x', 'a'.repeat(100000));
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it('invalid pattern calls onReject once per pattern', () => {
    let n = 0;
    safeRegexTest('(x+)+y-once', 'x', () => (n += 1));
    safeRegexTest('(x+)+y-once', 'x', () => (n += 1));
    expect(n).toBe(1);
  });

  it('validator flags an unsafe regex rule at save time', () => {
    const issues = validateStepsForActivation([
      {
        step_type: 'condition',
        step_config: {
          rules: [{ subject: 'message', operand: 'text', operator: 'matches_regex', value: '(a+)+$' }],
        },
        branches: { yes: [], no: [] },
      },
    ]);
    expect(issues.some((i) => i.path.endsWith('.value'))).toBe(true);
  });
});
