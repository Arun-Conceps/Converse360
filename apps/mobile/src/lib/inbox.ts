import type { Contact, Conversation, ConversationChannel } from '@/types';

export const WINDOW_MS = 24 * 60 * 60 * 1000;

export const channelOf = (c: Pick<Conversation, 'channel'>): ConversationChannel => c.channel ?? 'whatsapp';

/** Endpoint per channel — same body shape on all three (apps/web message-thread.tsx). */
export const SEND_PATH: Record<ConversationChannel, string> = {
  whatsapp: '/whatsapp/send',
  instagram: '/instagram/send',
  web: '/web/send',
};

/**
 * Is a free-text reply allowed right now? WhatsApp and Instagram count 24h from
 * the customer's last message; the web widget has no window. Closed means
 * "template only" — the composer swaps to that rather than sending and failing.
 */
export function isReplyWindowOpen(c: Pick<Conversation, 'channel' | 'last_inbound_at'>, now = Date.now()): boolean {
  if (channelOf(c) === 'web') return true;
  if (!c.last_inbound_at) return false;
  return now - new Date(c.last_inbound_at).getTime() < WINDOW_MS;
}

export function contactName(c: Pick<Contact, 'name' | 'phone' | 'ig_username'> | null | undefined): string {
  if (!c) return 'Unknown';
  return c.name?.trim() || c.phone || (c.ig_username ? `@${c.ig_username}` : 'Unknown');
}

export function initials(name: string): string {
  const parts = name.replace(/^@/, '').split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? '?').toUpperCase() + (parts.length > 1 ? parts[1][0].toUpperCase() : '');
}

export type InboxFilter = 'mine' | 'unassigned' | 'all' | 'unread';

export function matchesFilter(c: Conversation, f: InboxFilter, userId: string): boolean {
  switch (f) {
    case 'mine':
      return c.assigned_agent_id === userId;
    case 'unassigned':
      return !c.assigned_agent_id;
    case 'unread':
      return c.unread_count > 0;
    default:
      return true;
  }
}

export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
