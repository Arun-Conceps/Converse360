"use client";

import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Loader2, Lock, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  applyMention,
  extractMentionedIds,
  filterMentionables,
  findMentionQuery,
  type Mentionable,
} from "@/lib/notes/mentions";
import { cn } from "@/lib/utils";

/** Generous: a note is internal context, not a WhatsApp message. */
const NOTE_MAX = 2000;

interface NoteComposerProps {
  mentionables: Mentionable[];
  /** Viewers can read notes but not write them. */
  readOnly: boolean;
  /** Save the note. Must throw on failure so the text is kept. */
  onSubmit: (text: string, mentionedUserIds: string[]) => Promise<void>;
}

/**
 * The private-note box that replaces the reply box while "Private note" is
 * selected.
 *
 * ⚠️ NOTHING HERE TOUCHES `onSend` OR THE SEND ROUTES. A note is a row in
 * `contact_notes`, written by the parent through `onSubmit`; it never becomes a
 * message, so it cannot reach the customer however the buttons are pressed.
 *
 * ⚠️ NOT LOCKED BY THE 24-HOUR WINDOW. That window gates what we may SEND to a
 * customer; a note sends nothing, and "she called back, ring her after six" is
 * most useful exactly when the window has closed.
 */
export function NoteComposer({ mentionables, readOnly, onSubmit }: NoteComposerProps) {
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [index, setIndex] = useState(0);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  const mention = readOnly ? null : findMentionQuery(text, caret);
  const open = mention !== null && dismissedFor !== text;
  const matches = useMemo(
    () => (open && mention ? filterMentionables(mentionables, mention.query) : []),
    [open, mention, mentionables]
  );
  const active = Math.min(index, Math.max(matches.length - 1, 0));

  const choose = useCallback(
    (m: Mentionable) => {
      if (!mention) return;
      const next = applyMention(text, mention.start, caret, m.name);
      setText(next.text);
      setCaret(next.caret);
      setIndex(0);
      requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(next.caret, next.caret);
      });
    },
    [mention, text, caret]
  );

  const submit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || saving || readOnly) return;
    setSaving(true);
    try {
      await onSubmit(trimmed, extractMentionedIds(trimmed, mentionables));
      setText("");
      setCaret(0);
    } catch (e) {
      // Keep what they wrote: a lost note is worse than a failed one.
      toast.error(e instanceof Error ? e.message : "Could not save the note");
    } finally {
      setSaving(false);
    }
  }, [text, saving, readOnly, onSubmit, mentionables]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && matches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIndex((active + 1) % matches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setIndex((active - 1 + matches.length) % matches.length);
        return;
      }
      if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
        e.preventDefault();
        choose(matches[active]);
        return;
      }
    }
    if (open && e.key === "Escape") {
      e.preventDefault();
      setDismissedFor(text);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div>
      <div className="flex items-end gap-2">
        <div className="relative flex-1">
          {open && matches.length > 0 && (
            <div
              role="listbox"
              aria-label="Mention a teammate"
              className="border-border bg-popover text-popover-foreground absolute right-0 bottom-full left-0 z-20 mb-2 overflow-hidden rounded-xl border shadow-lg"
            >
              {matches.map((m, i) => (
                <button
                  key={m.userId}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  // mousedown, not click: click fires after the textarea has
                  // blurred and the list has closed.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(m);
                  }}
                  onMouseEnter={() => setIndex(i)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                    i === active ? "bg-muted" : "hover:bg-muted/60"
                  )}
                >
                  <span className="text-primary">@</span>
                  {m.name}
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={ref}
            value={text}
            maxLength={NOTE_MAX}
            rows={1}
            disabled={readOnly}
            onChange={(e) => {
              setText(e.target.value);
              setCaret(e.target.selectionStart ?? e.target.value.length);
              setIndex(0);
              setDismissedFor(null);
              // Same four-line cap as the reply box.
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 96)}px`;
            }}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
            onKeyDown={onKeyDown}
            placeholder={
              readOnly
                ? "Read-only — viewers can read notes but not write them"
                : "Write a private note. Type @ to tag a teammate"
            }
            className={cn(
              "border-warning/50 bg-warning-surface text-foreground placeholder-muted-foreground focus:border-warning w-full resize-none rounded-xl border px-4 py-2.5 text-sm outline-none",
              readOnly && "cursor-not-allowed opacity-50"
            )}
          />
        </div>
        <Button
          size="sm"
          onClick={() => void submit()}
          disabled={!text.trim() || saving || readOnly}
          aria-label="Add note"
          className="bg-warning text-background hover:bg-warning/90 h-9 w-9 shrink-0 p-0 disabled:opacity-40"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
      <p className="text-muted-foreground mt-1 flex items-center gap-1 pl-1 text-[10px]">
        <Lock className="h-3 w-3" aria-hidden />
        Private: never sent to the customer. Tagged teammates are notified.
      </p>
    </div>
  );
}
