"use client";

import { format } from "date-fns";
import { Lock } from "lucide-react";

import { splitMentions, type Mentionable } from "@/lib/notes/mentions";
import { cn } from "@/lib/utils";
import type { ContactNote } from "@/types";

interface NoteBubbleProps {
  note: ContactNote;
  /** Display name of whoever wrote it. */
  author: string;
  /** Who can be highlighted as a mention. */
  mentionables: Mentionable[];
  /** The signed-in user, so a mention OF them reads as addressed to them. */
  currentUserId?: string;
}

/**
 * A private note in the thread.
 *
 * Deliberately NOT a message bubble: different shape, dashed amber border and
 * a lock line, so nobody mistakes it for something the customer can see. It is
 * a separate component because the message bubble is built around delivery
 * ticks, reply quotes and reactions, none of which exist for a note.
 */
export function NoteBubble({
  note,
  author,
  mentionables,
  currentUserId,
}: NoteBubbleProps) {
  const segments = splitMentions(note.note_text, mentionables);
  return (
    <div className="flex justify-end">
      <div
        className="border-warning/50 bg-warning-surface text-foreground max-w-[85%] rounded-xl border border-dashed px-3 py-2 sm:max-w-[70%]"
        data-testid="private-note"
      >
        <p className="text-warning mb-1 flex items-center gap-1 text-[10px] font-medium">
          <Lock className="h-3 w-3" aria-hidden />
          Private note · only your team sees this
        </p>
        <p className="text-sm break-words whitespace-pre-wrap">
          {segments.map((s, i) =>
            s.userId ? (
              <span
                key={i}
                className={cn(
                  "text-primary rounded px-0.5 font-medium",
                  s.userId === currentUserId && "bg-primary/15"
                )}
              >
                {s.text}
              </span>
            ) : (
              <span key={i}>{s.text}</span>
            )
          )}
        </p>
        <p className="text-muted-foreground mt-1 text-[10px]">
          {author} · {format(new Date(note.created_at), "HH:mm")}
        </p>
      </div>
    </div>
  );
}
