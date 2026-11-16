/**
 * @mentions in private notes — the pure half.
 *
 * Kept free of React and Supabase so the rules the note composer and the
 * note bubble share can be pinned by a unit test.
 *
 * ⚠️ THE TEXT IS THE SOURCE OF TRUTH, NOT A TOKEN LIST. The composer does
 * not remember "this span was a mention"; at save time we scan the final
 * text for "@Name" and derive the ids from it. An agent who picks @Asha and
 * then deletes it, or edits it to @Ash, gets exactly the notifications the
 * note on screen implies — a parallel list of tokens would drift the moment
 * somebody edited around one.
 *
 * ⚠️ THE IDS ARE STILL UNTRUSTED. They go to the database in
 * `contact_notes.mentioned_user_ids`, and the notify trigger (migration 100)
 * re-checks workspace membership. Nothing here is a security boundary.
 */

export interface Mentionable {
  userId: string;
  /** The text that follows "@" — unique across the list. */
  name: string;
}

interface ProfileLike {
  user_id: string;
  full_name?: string | null;
  email?: string | null;
}

/** How much text after "@" we are willing to treat as a name being typed. */
const MAX_QUERY = 30;

function baseLabel(p: ProfileLike): string {
  const full = p.full_name?.trim();
  if (full) return full;
  const local = p.email?.split('@')[0]?.trim();
  return local || 'teammate';
}

/**
 * Everyone who can be mentioned, with labels that are unique. Two people both
 * called "Priya" would otherwise be one mention that notifies whichever came
 * first, so a colliding label gets its owner's email name appended.
 */
export function buildMentionables(profiles: ProfileLike[]): Mentionable[] {
  const seen = new Map<string, number>();
  const out: Mentionable[] = [];
  for (const p of profiles) {
    const base = baseLabel(p);
    const key = base.toLowerCase();
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    let name = base;
    if (count > 0) {
      const local = p.email?.split('@')[0]?.trim();
      name = `${base} (${local || count + 1})`;
    }
    out.push({ userId: p.user_id, name });
  }
  return out;
}

/**
 * Is the caret inside an "@query"? Returns where the "@" is and what has been
 * typed after it, or `null`.
 *
 * The "@" must start the text or follow whitespace, so an email address
 * ("a@b.com") never opens the list. Spaces ARE allowed inside the query
 * because names have them ("@Asha R"), and it is bounded by MAX_QUERY and by
 * line breaks so a stray "@" does not stay armed for the rest of the note.
 */
export function findMentionQuery(
  text: string,
  caret: number
): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(before[at - 1])) return null;
  const query = before.slice(at + 1);
  if (query.length > MAX_QUERY || /\n/.test(query)) return null;
  return { start: at, query };
}

/**
 * Who to offer for a query: names with a word starting with it first ("ra"
 * finds "Asha Rao" via "Rao"), then names merely containing it. Case-insensitive.
 */
export function filterMentionables(
  list: Mentionable[],
  query: string,
  limit = 5
): Mentionable[] {
  const q = query.trim().toLowerCase();
  if (!q) return list.slice(0, limit);
  const starts: Mentionable[] = [];
  const contains: Mentionable[] = [];
  for (const m of list) {
    const n = m.name.toLowerCase();
    if (n.startsWith(q) || n.split(/\s+/).some((w) => w.startsWith(q))) starts.push(m);
    else if (n.includes(q)) contains.push(m);
  }
  return [...starts, ...contains].slice(0, limit);
}

/**
 * Replace the "@query" the agent typed (from `start` to `caret`) with the
 * chosen name and a trailing space, and say where the caret should land.
 */
export function applyMention(
  text: string,
  start: number,
  caret: number,
  name: string
): { text: string; caret: number } {
  const insert = `@${name} `;
  return {
    text: text.slice(0, start) + insert + text.slice(caret),
    caret: start + insert.length,
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * One alternation of every name, longest first, so "@Asha Rao" is never
 * claimed by a shorter "@Asha". The lookahead stops "@Ash" matching inside
 * "@Ashley".
 */
function mentionRegex(list: Mentionable[]): RegExp | null {
  if (list.length === 0) return null;
  const names = [...list]
    .map((m) => m.name)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);
  return new RegExp(`@(${names.join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
}

/** The teammates the final text actually mentions, each once. */
export function extractMentionedIds(text: string, list: Mentionable[]): string[] {
  const re = mentionRegex(list);
  if (!re) return [];
  const byName = new Map(list.map((m) => [m.name.toLowerCase(), m.userId]));
  const ids = new Set<string>();
  for (const match of text.matchAll(re)) {
    const id = byName.get(match[1].toLowerCase());
    if (id) ids.add(id);
  }
  return [...ids];
}

export interface MentionSegment {
  text: string;
  /** Set when this segment is a mention of a known teammate. */
  userId?: string;
}

/** Split note text into plain and mention segments, for highlighting. */
export function splitMentions(text: string, list: Mentionable[]): MentionSegment[] {
  const re = mentionRegex(list);
  if (!re) return [{ text }];
  const byName = new Map(list.map((m) => [m.name.toLowerCase(), m.userId]));
  const out: MentionSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(re)) {
    const index = match.index ?? 0;
    if (index > last) out.push({ text: text.slice(last, index) });
    out.push({ text: match[0], userId: byName.get(match[1].toLowerCase()) });
    last = index + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.length ? out : [{ text }];
}
