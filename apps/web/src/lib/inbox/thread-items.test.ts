import { describe, expect, it } from "vitest";

import type { ContactNote, Message } from "@/types";
import { groupItemsByDate, mergeThread, visibleNotesFor } from "./thread-items";

const msg = (id: string, created_at: string) =>
  ({ id, created_at }) as unknown as Message;
const note = (id: string, created_at: string) =>
  ({ id, created_at, user_id: "u", contact_id: "c", note_text: id }) as ContactNote;

const ids = (items: ReturnType<typeof mergeThread>) =>
  items.map((i) => (i.kind === "message" ? i.msg.id : i.note.id));

describe("mergeThread", () => {
  it("interleaves notes with messages by time", () => {
    const merged = mergeThread(
      [msg("m1", "2026-11-13T10:00:00Z"), msg("m2", "2026-11-13T10:10:00Z")],
      [note("n1", "2026-11-13T10:05:00Z")]
    );
    expect(ids(merged)).toEqual(["m1", "n1", "m2"]);
  });
  it("keeps the message first when a note has the same timestamp", () => {
    const merged = mergeThread(
      [msg("m1", "2026-11-13T10:00:00Z")],
      [note("n1", "2026-11-13T10:00:00Z")]
    );
    expect(ids(merged)).toEqual(["m1", "n1"]);
  });
  it("tags each row with its kind", () => {
    const merged = mergeThread(
      [msg("m1", "2026-11-13T10:00:00Z")],
      [note("n1", "2026-11-13T10:01:00Z")]
    );
    expect(merged.map((i) => i.kind)).toEqual(["message", "note"]);
  });
  it("works with no notes, and with no messages", () => {
    expect(ids(mergeThread([msg("m1", "2026-11-13T10:00:00Z")], []))).toEqual(["m1"]);
    expect(ids(mergeThread([], [note("n1", "2026-11-13T10:00:00Z")]))).toEqual(["n1"]);
  });
});

describe("groupItemsByDate", () => {
  it("starts a new group on each calendar day", () => {
    // Local noon on three dates, so the day boundary does not depend on the
    // machine's timezone.
    const at = (d: number, h = 12) => new Date(2026, 10, d, h).toISOString();
    const groups = groupItemsByDate(
      mergeThread([msg("a", at(12)), msg("b", at(12, 13)), msg("c", at(13))], [
        note("n", at(13, 14)),
      ])
    );
    expect(groups.map((g) => g.items.length)).toEqual([2, 2]);
  });
});

describe("visibleNotesFor", () => {
  const messages = [msg("m1", "2026-11-13T10:00:00Z")];
  const notes = [
    note("old", "2026-11-12T09:00:00Z"),
    note("new", "2026-11-13T10:30:00Z"),
  ];
  it("shows every note when all history is loaded", () => {
    expect(visibleNotesFor(notes, messages, false).map((n) => n.id)).toEqual([
      "old",
      "new",
    ]);
  });
  it("holds back notes older than the oldest loaded message while more history remains", () => {
    expect(visibleNotesFor(notes, messages, true).map((n) => n.id)).toEqual(["new"]);
  });
  it("shows everything when nothing is loaded yet", () => {
    expect(visibleNotesFor(notes, [], true)).toHaveLength(2);
  });
});
