/**
 * Bounded regex evaluation for author-supplied patterns run against
 * customer-controlled text (`matches_regex` conditions).
 *
 * V8's matcher backtracks, and Node cannot time a regex out, so
 * `(a+)+$` against "aaaa…!" blocks the event loop for every tenant. We did
 * not take `re2` (native build on Windows/Linux CI + docker is a risk for
 * one feature). Instead the worst case is bounded by construction:
 *
 *   - pattern length  <= MAX_PATTERN_LENGTH
 *   - tested text     truncated to MAX_INPUT_LENGTH
 *   - a conservative static check REJECTS anything that can go
 *     exponential (a quantified group that itself contains a quantifier or
 *     an alternation, back-references, lookarounds) and caps the number of
 *     unbounded quantifiers so the polynomial case stays tiny
 *     (~500^3/6 steps worst case when anchored, 500^3 when not).
 *
 * The check is deliberately over-strict: a rejected-but-harmless pattern is
 * an authoring error shown at save time; an accepted-but-explosive one is
 * an outage for all tenants.
 */
export const MAX_PATTERN_LENGTH = 200;
export const MAX_INPUT_LENGTH = 500;
const MAX_UNBOUNDED_ANCHORED = 3;
const MAX_UNBOUNDED_UNANCHORED = 2;

export type RegexCheck = { ok: true } | { ok: false; reason: string };

interface Group {
  hasQuantifier: boolean;
  hasAlternation: boolean;
}

/** Parse `{n}`, `{n,}`, `{n,m}` at index i (pointing at `{`). */
function readBraceQuantifier(
  p: string,
  i: number,
): { end: number; max: number } | null {
  const m = /^\{(\d+)(?:(,)(\d*))?\}/.exec(p.slice(i));
  if (!m) return null;
  const min = Number(m[1]);
  const max = m[2] ? (m[3] === '' ? Infinity : Number(m[3])) : min;
  return { end: i + m[0].length, max };
}

export function checkRegexSafety(pattern: string): RegexCheck {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return { ok: false, reason: `pattern is longer than ${MAX_PATTERN_LENGTH} characters` };
  }
  try {
    new RegExp(pattern);
  } catch {
    return { ok: false, reason: 'pattern is not a valid regular expression' };
  }

  const stack: Group[] = [];
  // The most recently closed group, so a following quantifier can be
  // judged against what the group contained.
  let lastClosed: Group | null = null;
  let top: Group = { hasQuantifier: false, hasAlternation: false };
  // Unanchored matching retries from every start offset, adding one degree
  // to the polynomial worst case, so it gets a smaller budget.
  const maxUnbounded =
    pattern.startsWith('^') && !pattern.includes('|')
      ? MAX_UNBOUNDED_ANCHORED
      : MAX_UNBOUNDED_UNANCHORED;
  let unbounded = 0;
  let i = 0;

  const applyQuantifier = (max: number, closed: Group | null): RegexCheck | null => {
    if (max > 1 && closed && (closed.hasQuantifier || closed.hasAlternation)) {
      return {
        ok: false,
        reason: 'nested repetition (a repeated group that itself repeats or alternates) can hang the matcher',
      };
    }
    if (max > 1) {
      top.hasQuantifier = true;
      if (max === Infinity) {
        unbounded += 1;
        if (unbounded > maxUnbounded) {
          return {
            ok: false,
            reason: `too many open-ended repetitions (max ${maxUnbounded})`,
          };
        }
      }
    }
    return null;
  };

  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === '\\') {
      const next = pattern[i + 1] ?? '';
      if (/[1-9]/.test(next) || next === 'k') {
        return { ok: false, reason: 'back-references are not allowed' };
      }
      i += 2;
      lastClosed = null;
      continue;
    }
    if (ch === '[') {
      // Skip the character class; quantifiers inside are literals.
      i += 1;
      while (i < pattern.length && pattern[i] !== ']') {
        i += pattern[i] === '\\' ? 2 : 1;
      }
      i += 1;
      lastClosed = null;
      continue;
    }
    if (ch === '(') {
      if (pattern[i + 1] === '?') {
        const rest = pattern.slice(i + 2, i + 4);
        if (rest.startsWith('=') || rest.startsWith('!') || rest === '<=' || rest === '<!') {
          return { ok: false, reason: 'lookahead / lookbehind is not allowed' };
        }
      }
      stack.push(top);
      top = { hasQuantifier: false, hasAlternation: false };
      i += 1;
      lastClosed = null;
      continue;
    }
    if (ch === ')') {
      const closed = top;
      top = stack.pop() ?? { hasQuantifier: false, hasAlternation: false };
      // A group containing a repetition is itself "repeating content" for
      // its parent, whether or not it is quantified.
      if (closed.hasQuantifier) top.hasQuantifier = true;
      lastClosed = closed;
      i += 1;
      continue;
    }
    if (ch === '|') {
      top.hasAlternation = true;
      i += 1;
      lastClosed = null;
      continue;
    }
    if (ch === '*' || ch === '+' || ch === '?' || ch === '{') {
      let max: number;
      let end = i + 1;
      if (ch === '*' || ch === '+') {
        max = Infinity;
      } else if (ch === '?') {
        max = 1;
      } else {
        const b = readBraceQuantifier(pattern, i);
        if (!b) {
          // A literal "{".
          i += 1;
          lastClosed = null;
          continue;
        }
        max = b.max;
        end = b.end;
      }
      // Lazy / possessive-looking suffix.
      if (pattern[end] === '?') end += 1;
      const bad = applyQuantifier(max, lastClosed);
      if (bad) return bad;
      i = end;
      lastClosed = null;
      continue;
    }
    i += 1;
    lastClosed = null;
  }
  return { ok: true };
}

const warned = new Set<string>();

/**
 * Evaluate `pattern` against `text` with the bounds above. Unsafe or
 * invalid patterns return false (and log once per distinct pattern).
 */
export function safeRegexTest(
  pattern: string,
  text: string,
  onReject?: (reason: string) => void,
): boolean {
  const check = checkRegexSafety(pattern);
  if (!check.ok) {
    if (!warned.has(pattern) && warned.size < 500) {
      warned.add(pattern);
      onReject?.(check.reason);
    }
    return false;
  }
  const bounded =
    text.length > MAX_INPUT_LENGTH ? text.slice(0, MAX_INPUT_LENGTH) : text;
  // No 'g' flag: a stateful lastIndex would make identical input alternate.
  return new RegExp(pattern).test(bounded);
}
