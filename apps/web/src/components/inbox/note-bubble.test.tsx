import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ContactNote } from '@/types';
import { NoteBubble } from './note-bubble';

const note = (text: string): ContactNote => ({
  id: 'n1',
  contact_id: 'c1',
  user_id: 'u-priya',
  note_text: text,
  created_at: '2026-11-13T10:30:00Z',
});

const team = [
  { userId: 'u-arun', name: 'Arun' },
  { userId: 'u-asha', name: 'Asha Rao' },
];

const render = (text: string, currentUserId?: string) =>
  renderToStaticMarkup(
    React.createElement(NoteBubble, {
      note: note(text),
      author: 'Priya',
      mentionables: team,
      currentUserId,
    })
  );

describe('NoteBubble', () => {
  it('says plainly that the note is private', () => {
    expect(render('call her after six')).toContain('Private note');
    expect(render('call her after six')).toContain('only your team sees this');
  });

  it('shows who wrote it', () => {
    expect(render('x')).toContain('Priya');
  });

  it('keeps the text and highlights a mention of a known teammate', () => {
    const html = render('please check @Arun and @Nobody');
    expect(html).toContain('please check ');
    expect(html).toContain('@Arun');
    // Only the real teammate is highlighted, @Nobody stays plain text.
    expect(html.match(/text-primary/g)?.length).toBe(1);
  });

  it('marks a mention of the signed-in user so it reads as addressed to them', () => {
    expect(render('ping @Arun', 'u-arun')).toContain('bg-primary/15');
    expect(render('ping @Arun', 'u-someone-else')).not.toContain('bg-primary/15');
  });

  it('escapes markup typed into a note instead of rendering it', () => {
    const html = render('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('is identifiable for tests and tooling', () => {
    expect(render('x')).toContain('data-testid="private-note"');
  });
});
