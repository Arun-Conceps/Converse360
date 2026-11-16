import { format } from "date-fns";

import type { ContactNote, Message } from "@/types";

/**
 * One row of the thread: a message, or a private note interleaved by time.
 *
 * Notes are NOT messages: they never touch the `messages` table or any send
 * path. They share the timeline only so context appears where it happened.
 */
export type ThreadItem =
  | { kind: "message"; at: string; msg: Message }
  | { kind: "note"; at: string; note: ContactNote };

/**
 * Merge messages and notes into one chronological list.
 *
 * `Array.prototype.sort` is stable, and messages are concatenated first, so a
 * note and a message with the same timestamp keep the message first.
 */
export function mergeThread(
  messages: Message[],
  notes: ContactNote[]
): ThreadItem[] {
  const items: ThreadItem[] = [
    ...messages.map((msg) => ({
      kind: "message" as const,
      at: msg.created_at,
      msg,
    })),
    ...notes.map((note) => ({
      kind: "note" as const,
      at: note.created_at,
      note,
    })),
  ];
  return items.sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
  );
}

/** Group a chronological list under one heading per calendar day. */
export function groupItemsByDate(items: ThreadItem[]) {
  const groups: { date: string; items: ThreadItem[] }[] = [];
  let currentDate = "";

  for (const item of items) {
    const day = format(new Date(item.at), "yyyy-MM-dd");
    if (day !== currentDate) {
      currentDate = day;
      groups.push({ date: item.at, items: [item] });
    } else {
      groups[groups.length - 1].items.push(item);
    }
  }

  return groups;
}

/**
 * The notes to show alongside the messages loaded so far.
 *
 * While older history is still unloaded (`hasMoreMessages`), notes older than
 * the oldest loaded message are held back: shown now they would float above
 * the "load older" button with nothing around them, in the wrong place. They
 * appear as that history loads.
 */
export function visibleNotesFor(
  notes: ContactNote[],
  messages: Message[],
  hasMoreMessages: boolean
): ContactNote[] {
  if (!hasMoreMessages || messages.length === 0) return notes;
  const floor = messages[0].created_at;
  return notes.filter((n) => n.created_at >= floor);
}
