import { describe, expect, it } from 'vitest';
import {
  filterQuickReplies,
  fillQuickReply,
  isValidShortcut,
  normaliseShortcut,
  triggerQuery,
  type QuickReply,
} from './match';

const reply = (shortcut: string, body: string, use_count = 0): QuickReply => ({
  id: shortcut,
  account_id: 'a',
  shortcut,
  body,
  media_url: null,
  media_kind: null,
  use_count,
  created_at: '',
  updated_at: '',
});

describe('normaliseShortcut', () => {
  it('strips the slash, lower-cases and hyphenates spaces', () => {
    expect(normaliseShortcut('  /Return Policy ')).toBe('return-policy');
  });
  it('drops characters the database CHECK would reject', () => {
    expect(normaliseShortcut('hi!@#there?')).toBe('hithere');
  });
  it('caps at 32 characters', () => {
    expect(normaliseShortcut('a'.repeat(50))).toHaveLength(32);
  });
  it('always produces something isValidShortcut accepts, or an empty string', () => {
    for (const raw of ['/Hello', 'a b c', '__x', '---', '!!!', '']) {
      const s = normaliseShortcut(raw);
      expect(s === '' || isValidShortcut(s)).toBe(true);
    }
  });
});

describe('isValidShortcut', () => {
  it('mirrors the migration 099 CHECK', () => {
    expect(isValidShortcut('pricing')).toBe(true);
    expect(isValidShortcut('a_b-c9')).toBe(true);
    expect(isValidShortcut('')).toBe(false);
    expect(isValidShortcut('Has Space')).toBe(false);
    expect(isValidShortcut('slash/inside')).toBe(false);
    expect(isValidShortcut('x'.repeat(33))).toBe(false);
  });
});

describe('triggerQuery', () => {
  it('opens on a bare slash with an empty query', () => {
    expect(triggerQuery('/')).toBe('');
  });
  it('returns the lower-cased text after the slash', () => {
    expect(triggerQuery('/Pri')).toBe('pri');
  });
  it('is not a trigger once a space is typed', () => {
    expect(triggerQuery('/pricing please')).toBeNull();
  });
  it('is not a trigger when the slash is not first', () => {
    expect(triggerQuery('and/or')).toBeNull();
    expect(triggerQuery('see https://x.test/a')).toBeNull();
  });
  it('is not a trigger for ordinary text', () => {
    expect(triggerQuery('hello')).toBeNull();
    expect(triggerQuery('')).toBeNull();
  });
});

describe('filterQuickReplies', () => {
  const all = [
    reply('pricing', 'Our plans start at 999', 2),
    reply('hours', 'Open nine to seven', 9),
    reply('thanks', 'Thank you for the pricing question', 5),
    reply('hello', 'Hi there', 1),
  ];

  it('with no query lists the most used first', () => {
    expect(filterQuickReplies(all, '').map((r) => r.shortcut)).toEqual([
      'hours',
      'thanks',
      'pricing',
      'hello',
    ]);
  });
  it('ranks a shortcut prefix above a body-only match', () => {
    // "pri" is the prefix of "pricing" and appears only in thanks' body.
    expect(filterQuickReplies(all, 'pri').map((r) => r.shortcut)).toEqual([
      'pricing',
      'thanks',
    ]);
  });
  it('matches inside the shortcut, not only at its start', () => {
    expect(filterQuickReplies(all, 'ours').map((r) => r.shortcut)).toEqual(['hours']);
  });
  it('returns nothing when nothing matches', () => {
    expect(filterQuickReplies(all, 'zzz')).toEqual([]);
  });
  it('respects the limit', () => {
    expect(filterQuickReplies(all, '', 2)).toHaveLength(2);
  });
  it('does not mutate its input', () => {
    const copy = [...all];
    filterQuickReplies(all, '');
    expect(all).toEqual(copy);
  });
});

describe('fillQuickReply', () => {
  it('fills name, first name and phone', () => {
    expect(
      fillQuickReply('Hi {{name}} ({{first_name}}) on {{phone}}', {
        name: 'Asha Rao',
        phone: '+919876543210',
      })
    ).toBe('Hi Asha Rao (Asha) on +919876543210');
  });
  it('says "there" when there is no real name', () => {
    expect(fillQuickReply('Hi {{name}},', { name: null })).toBe('Hi there,');
    expect(fillQuickReply('Hi {{first_name}},', { name: '  ' })).toBe('Hi there,');
  });
  it('treats an Instagram id standing in for a name as no name', () => {
    expect(
      fillQuickReply('Hi {{name}}', {
        name: '17841400000000',
        igScopedId: '17841400000000',
      })
    ).toBe('Hi there');
  });
  it('tolerates spaces and case inside the braces', () => {
    expect(fillQuickReply('{{ NAME }}', { name: 'Vikram' })).toBe('Vikram');
  });
  it('leaves an unknown token visible for the agent to fix', () => {
    expect(fillQuickReply('Order {{order_id}}', { name: 'x' })).toBe(
      'Order {{order_id}}'
    );
  });
});
