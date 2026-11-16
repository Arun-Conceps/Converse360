/**
 * Quick replies — the pure half (matching, shape, variable fill).
 *
 * Kept free of React and Supabase so the rules the composer depends on can
 * be pinned by a unit test: what counts as "the agent is asking for a quick
 * reply", which saved replies that matches, and what a reply looks like once
 * it has been dropped into the box.
 *
 * The SHORTCUT SHAPE here must agree with migration 099's CHECK
 * (`^[a-z0-9_-]{1,32}$`). When they disagree a reply saves in the browser and
 * is rejected by the database — or, worse, saves through another route and
 * can never be reached from the keyboard.
 */

export const SHORTCUT_MAX = 32;
/** Matches MEDIA_CAPTION_MAX in the composer and migration 099's CHECK. */
export const BODY_MAX = 1024;

const SHORTCUT_RE = /^[a-z0-9_-]{1,32}$/;

export type QuickReplyMediaKind = 'image' | 'video' | 'audio' | 'document';

export interface QuickReply {
  id: string;
  account_id: string;
  shortcut: string;
  body: string;
  media_url: string | null;
  media_kind: QuickReplyMediaKind | null;
  use_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Turn whatever an agent typed into a legal shortcut: no leading slash,
 * lower-case, spaces become hyphens, anything else outside [a-z0-9_-] is
 * dropped, capped at SHORTCUT_MAX.
 */
export function normaliseShortcut(raw: string): string {
  return raw
    .trim()
    .replace(/^\/+/, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, SHORTCUT_MAX);
}

export function isValidShortcut(shortcut: string): boolean {
  return SHORTCUT_RE.test(shortcut);
}

/**
 * Is the composer text a request for the quick-reply list? Returns the query
 * (what follows the slash, lower-cased, possibly empty) or `null`.
 *
 * The rule is deliberately narrow: the text must START with "/" and contain
 * no whitespace. A slash anywhere else is just a slash ("and/or", a URL), and
 * the moment the agent types a space they are writing a message, not
 * choosing a shortcut, so the list closes instead of trapping their Enter.
 */
export function triggerQuery(text: string): string | null {
  if (!text.startsWith('/')) return null;
  const rest = text.slice(1);
  if (/\s/.test(rest)) return null;
  return rest.toLowerCase();
}

/**
 * The replies to offer for a query. Prefix matches on the shortcut come
 * first (typing "/pri" should put "pricing" above a reply that merely
 * mentions "pri" in its body), then substring matches on shortcut or body.
 * Within each group the most-used reply leads, then alphabetical, so the
 * list order is stable between keystrokes.
 */
export function filterQuickReplies(
  replies: QuickReply[],
  query: string,
  limit = 6
): QuickReply[] {
  const q = query.toLowerCase();
  const byUse = (a: QuickReply, b: QuickReply) =>
    b.use_count - a.use_count || a.shortcut.localeCompare(b.shortcut);

  if (!q) return [...replies].sort(byUse).slice(0, limit);

  const prefix: QuickReply[] = [];
  const rest: QuickReply[] = [];
  for (const r of replies) {
    if (r.shortcut.startsWith(q)) prefix.push(r);
    else if (r.shortcut.includes(q) || r.body.toLowerCase().includes(q)) rest.push(r);
  }
  return [...prefix.sort(byUse), ...rest.sort(byUse)].slice(0, limit);
}

export interface QuickReplyVars {
  name?: string | null;
  phone?: string | null;
  /** Instagram-scoped id: when `name` equals it, there is no real name yet. */
  igScopedId?: string | null;
}

/**
 * Fill {{name}}, {{first_name}} and {{phone}} from the contact.
 *
 * ⚠️ UNLIKE the automation engine, an unknown token is LEFT IN PLACE rather
 * than blanked. Automations send unattended, so a visible "{{vars.x}}" in a
 * customer's chat reads as a broken app and is erased. A quick reply lands in
 * a box the agent reads and edits first, where a leftover token is a cue to
 * fix it and a silent blank is a sentence with a hole in it.
 *
 * A contact with no real name fills as "there", so "Hi {{name}}," still
 * reads as "Hi there,".
 */
export function fillQuickReply(body: string, vars: QuickReplyVars): string {
  const real =
    vars.name && vars.name.trim() && vars.name !== vars.igScopedId
      ? vars.name.trim()
      : '';
  const values: Record<string, string> = {
    name: real || 'there',
    first_name: real ? real.split(/\s+/)[0] : 'there',
    phone: vars.phone ?? '',
  };
  return body.replace(
    /\{\{\s*(name|first_name|phone)\s*\}\}/gi,
    (_m, key: string) => values[key.toLowerCase()]
  );
}
