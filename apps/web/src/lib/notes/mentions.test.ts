import { describe, expect, it } from 'vitest';
import {
  applyMention,
  buildMentionables,
  extractMentionedIds,
  filterMentionables,
  findMentionQuery,
  splitMentions,
  type Mentionable,
} from './mentions';

const team: Mentionable[] = [
  { userId: 'u-asha', name: 'Asha Rao' },
  { userId: 'u-arun', name: 'Arun' },
  { userId: 'u-ash', name: 'Ash' },
];

describe('buildMentionables', () => {
  it('uses the full name, falling back to the email name', () => {
    expect(
      buildMentionables([
        { user_id: '1', full_name: 'Asha Rao', email: 'a@x.test' },
        { user_id: '2', full_name: '  ', email: 'meera@x.test' },
      ]).map((m) => m.name)
    ).toEqual(['Asha Rao', 'meera']);
  });
  it('keeps colliding names apart so a mention notifies the right person', () => {
    const out = buildMentionables([
      { user_id: '1', full_name: 'Priya', email: 'priya.s@x.test' },
      { user_id: '2', full_name: 'priya', email: 'priya.k@x.test' },
    ]);
    expect(new Set(out.map((m) => m.name.toLowerCase())).size).toBe(2);
    expect(out[1].name).toContain('priya.k');
  });
});

describe('findMentionQuery', () => {
  it('opens on a bare @', () => {
    expect(findMentionQuery('@', 1)).toEqual({ start: 0, query: '' });
  });
  it('returns what has been typed after the @, up to the caret', () => {
    expect(findMentionQuery('hi @As', 6)).toEqual({ start: 3, query: 'As' });
    expect(findMentionQuery('hi @Asha there', 8)).toEqual({ start: 3, query: 'Asha' });
  });
  it('allows a space inside the query for two-word names', () => {
    expect(findMentionQuery('ask @Asha R', 11)).toEqual({ start: 4, query: 'Asha R' });
  });
  it('ignores an @ inside an email address', () => {
    expect(findMentionQuery('mail a@b.com', 12)).toBeNull();
  });
  it('closes across a line break and past the length cap', () => {
    expect(findMentionQuery('@Asha\nnext', 10)).toBeNull();
    expect(findMentionQuery('@' + 'x'.repeat(31), 32)).toBeNull();
  });
  it('is null with no @ at all', () => {
    expect(findMentionQuery('plain', 5)).toBeNull();
  });
});

describe('filterMentionables', () => {
  it('lists everyone for an empty query, capped', () => {
    expect(filterMentionables(team, '', 2)).toHaveLength(2);
  });
  it('matches the start of any word in the name', () => {
    expect(filterMentionables(team, 'rao').map((m) => m.userId)).toEqual(['u-asha']);
  });
  it('ranks word-start matches above substring matches', () => {
    expect(filterMentionables(team, 'sh').map((m) => m.userId)).toEqual([
      'u-asha',
      'u-ash',
    ]);
  });
  it('is case-insensitive and empty when nothing matches', () => {
    expect(filterMentionables(team, 'ARUN')).toHaveLength(1);
    expect(filterMentionables(team, 'zzz')).toEqual([]);
  });
});

describe('applyMention', () => {
  it('replaces the typed query with the name and a trailing space', () => {
    expect(applyMention('hi @As', 3, 6, 'Asha Rao')).toEqual({
      text: 'hi @Asha Rao ',
      caret: 13,
    });
  });
  it('keeps the text after the caret', () => {
    expect(applyMention('@A and more', 0, 2, 'Arun')).toEqual({
      text: '@Arun  and more',
      caret: 6,
    });
  });
});

describe('extractMentionedIds', () => {
  it('derives ids from the final text, once each', () => {
    expect(
      extractMentionedIds('@Arun please check, cc @Asha Rao and @arun again', team).sort()
    ).toEqual(['u-arun', 'u-asha']);
  });
  it('prefers the longer name over a name that is its prefix', () => {
    // "@Asha Rao" must not be claimed by a shorter "@Ash".
    expect(extractMentionedIds('@Asha Rao', team)).toEqual(['u-asha']);
  });
  it('does not match inside a longer word', () => {
    expect(extractMentionedIds('@Ashley is not on the team', team)).toEqual([]);
  });
  it('drops a mention the agent edited away', () => {
    expect(extractMentionedIds('@Arun', team)).toEqual(['u-arun']);
    expect(extractMentionedIds('Arun', team)).toEqual([]);
  });
  it('copes with regex metacharacters in a name', () => {
    const odd: Mentionable[] = [{ userId: 'u-1', name: 'Priya (priya.k)' }];
    expect(extractMentionedIds('hello @Priya (priya.k)!', odd)).toEqual(['u-1']);
  });
  it('is empty when there is nobody to mention', () => {
    expect(extractMentionedIds('@Arun', [])).toEqual([]);
  });
});

describe('splitMentions', () => {
  it('splits plain text and mentions in order', () => {
    expect(splitMentions('hi @Arun, thanks', team)).toEqual([
      { text: 'hi ' },
      { text: '@Arun', userId: 'u-arun' },
      { text: ', thanks' },
    ]);
  });
  it('returns the whole text when there is no mention', () => {
    expect(splitMentions('nothing here', team)).toEqual([{ text: 'nothing here' }]);
    expect(splitMentions('', team)).toEqual([{ text: '' }]);
  });
  it('round-trips: the segments join back to the original', () => {
    const text = '@Asha Rao and @Arun, then @Ash.';
    expect(
      splitMentions(text, team)
        .map((s) => s.text)
        .join('')
    ).toBe(text);
  });
});
