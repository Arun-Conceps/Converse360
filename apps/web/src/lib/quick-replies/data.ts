'use client';

/**
 * Quick replies' data layer — `quick_replies` (migration 099).
 *
 * Read and written straight from the browser through PostgREST under RLS,
 * the same shape as the media library: the table holds a shortcut and some
 * text the workspace chose to share with its own agents, so an API hop would
 * add a round trip and no authorization the policies do not already give.
 *
 * ⚠️ EVERY CALL TAKES THE WORKSPACE EXPLICITLY AND FILTERS ON IT — reads AND
 * writes. RLS scopes a browser query to the caller's MEMBERSHIPS, so an agency
 * login with several client workspaces would otherwise see (and could edit)
 * all of their replies merged. See lib/workspace/scope.ts.
 */

import { createClient } from '@/lib/supabase/client';
import {
  BODY_MAX,
  isValidShortcut,
  normaliseShortcut,
  type QuickReply,
} from './match';

/** Postgres unique_violation, as PostgREST relays it. */
const UNIQUE_VIOLATION = '23505';

export class QuickReplyError extends Error {
  constructor(
    message: string,
    readonly kind: 'duplicate' | 'invalid' | 'failed'
  ) {
    super(message);
    this.name = 'QuickReplyError';
  }
}

export interface QuickReplyInput {
  shortcut: string;
  body: string;
}

/** Validate before the round trip, with messages an agent can act on. */
function checked(input: QuickReplyInput): QuickReplyInput {
  const shortcut = normaliseShortcut(input.shortcut);
  const body = input.body.trim();
  if (!isValidShortcut(shortcut)) {
    throw new QuickReplyError(
      'Give it a short name using letters, numbers, - or _.',
      'invalid'
    );
  }
  if (!body) {
    throw new QuickReplyError('Write the message to insert.', 'invalid');
  }
  if (body.length > BODY_MAX) {
    throw new QuickReplyError(
      `Keep it under ${BODY_MAX} characters so it can also be a media caption.`,
      'invalid'
    );
  }
  return { shortcut, body };
}

function toError(err: { code?: string; message: string }, shortcut: string) {
  if (err.code === UNIQUE_VIOLATION) {
    return new QuickReplyError(`"/${shortcut}" is already taken.`, 'duplicate');
  }
  return new QuickReplyError(err.message, 'failed');
}

/** Every quick reply for one workspace, most-used first. */
export async function listQuickReplies(accountId: string): Promise<QuickReply[]> {
  const { data, error } = await createClient()
    .from('quick_replies')
    .select('*')
    .eq('account_id', accountId)
    .order('use_count', { ascending: false })
    .order('shortcut', { ascending: true });
  if (error) throw new QuickReplyError(error.message, 'failed');
  return (data ?? []) as QuickReply[];
}

export async function createQuickReply(
  accountId: string,
  userId: string | null,
  input: QuickReplyInput
): Promise<QuickReply> {
  const v = checked(input);
  const { data, error } = await createClient()
    .from('quick_replies')
    .insert({ account_id: accountId, created_by: userId, ...v })
    .select('*')
    .single();
  if (error) throw toError(error, v.shortcut);
  return data as QuickReply;
}

export async function updateQuickReply(
  accountId: string,
  id: string,
  input: QuickReplyInput
): Promise<QuickReply> {
  const v = checked(input);
  const { data, error } = await createClient()
    .from('quick_replies')
    .update(v)
    .eq('account_id', accountId)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw toError(error, v.shortcut);
  return data as QuickReply;
}

export async function deleteQuickReply(accountId: string, id: string): Promise<void> {
  const { error } = await createClient()
    .from('quick_replies')
    .delete()
    .eq('account_id', accountId)
    .eq('id', id);
  if (error) throw new QuickReplyError(error.message, 'failed');
}

/**
 * Count a use. Best-effort and deliberately silent on failure: it only feeds
 * the ordering of the "/" list, and an agent who just inserted a reply must
 * never see an error about a counter. Read-modify-write rather than an
 * increment RPC, because two agents racing on the same reply lose at worst
 * one tick of a sort key.
 */
export async function bumpQuickReplyUse(
  accountId: string,
  id: string,
  current: number
): Promise<void> {
  await createClient()
    .from('quick_replies')
    .update({ use_count: current + 1 })
    .eq('account_id', accountId)
    .eq('id', id);
}
