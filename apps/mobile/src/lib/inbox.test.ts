import { describe, expect, it } from 'vitest';
import { contactName, initials, isReplyWindowOpen, matchesFilter, relativeTime } from './inbox';
import type { Conversation } from '@/types';

const NOW = Date.parse('2026-11-16T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();
const conv = (o: Partial<Conversation> = {}): Conversation => ({
  id: 'c1', account_id: 'a1', contact_id: 'p1', status: 'open', unread_count: 0, ...o,
});

describe('isReplyWindowOpen', () => {
  it('is open within 24h on WhatsApp and closed after', () => {
    expect(isReplyWindowOpen(conv({ last_inbound_at: hoursAgo(23) }), NOW)).toBe(true);
    expect(isReplyWindowOpen(conv({ last_inbound_at: hoursAgo(25) }), NOW)).toBe(false);
  });
  it('is closed when the customer never wrote', () => {
    expect(isReplyWindowOpen(conv({ last_inbound_at: null }), NOW)).toBe(false);
  });
  it('treats a missing channel as WhatsApp (older realtime payloads)', () => {
    expect(isReplyWindowOpen(conv({ channel: undefined, last_inbound_at: hoursAgo(30) }), NOW)).toBe(false);
  });
  it('never closes on the web widget', () => {
    expect(isReplyWindowOpen(conv({ channel: 'web', last_inbound_at: hoursAgo(500) }), NOW)).toBe(true);
  });
});

describe('matchesFilter', () => {
  it('mine / unassigned / unread', () => {
    expect(matchesFilter(conv({ assigned_agent_id: 'u1' }), 'mine', 'u1')).toBe(true);
    expect(matchesFilter(conv({ assigned_agent_id: 'u2' }), 'mine', 'u1')).toBe(false);
    expect(matchesFilter(conv(), 'unassigned', 'u1')).toBe(true);
    expect(matchesFilter(conv({ unread_count: 2 }), 'unread', 'u1')).toBe(true);
    expect(matchesFilter(conv(), 'unread', 'u1')).toBe(false);
  });
});

describe('display helpers', () => {
  it('falls back name → phone → @handle → Unknown', () => {
    expect(contactName({ name: ' Meera ', phone: '+91', ig_username: 'm' })).toBe('Meera');
    expect(contactName({ name: '', phone: '+91 98', ig_username: 'm' })).toBe('+91 98');
    expect(contactName({ name: null, phone: null, ig_username: 'sana' })).toBe('@sana');
    expect(contactName(null)).toBe('Unknown');
  });
  it('initials', () => {
    expect(initials('Meera Kapoor')).toBe('MK');
    expect(initials('@sana')).toBe('S');
  });
  it('relativeTime', () => {
    expect(relativeTime(hoursAgo(0), NOW)).toBe('now');
    expect(relativeTime(hoursAgo(3), NOW)).toBe('3h');
  });
});
