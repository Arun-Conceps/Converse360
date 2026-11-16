'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ContactNote } from '@/types';

interface Loaded {
  contactId: string;
  notes: ContactNote[];
}

/**
 * The private notes for one contact, live.
 *
 * ⚠️ NOTES BELONG TO THE CONTACT, so the thread shows the same notes in every
 * conversation with that person (migration 100 — `conversation_id` only
 * records where a note was written, for a mention to link back to).
 *
 * ⚠️ SCOPED TWICE: by contact AND by the active workspace. The contact id is
 * already workspace-scoped, but RLS reaches every workspace the user belongs
 * to, so the account filter is the cheap guarantee that an agency login never
 * sees another client's note on a contact that happens to share an id with
 * nothing — see lib/workspace/scope.ts.
 *
 * Loaded state is keyed by contact id and only returned while it matches, so
 * switching conversations never flashes the previous person's notes for a
 * frame. (Clearing in an effect would do the same with an extra render and a
 * lint suppression.)
 *
 * Load failure leaves the list empty: a thread that cannot reach its notes is
 * still a working thread.
 */
export function useContactNotes(
  contactId: string | null | undefined,
  accountId: string | null | undefined
) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!contactId || !accountId) return;
    let cancelled = false;
    const supabase = createClient();

    void (async () => {
      const { data, error } = await supabase
        .from('contact_notes')
        .select('*')
        .eq('contact_id', contactId)
        .eq('account_id', accountId)
        .order('created_at', { ascending: true });
      if (cancelled) return;
      setLoaded({
        contactId,
        notes: error ? [] : ((data ?? []) as ContactNote[]),
      });
    })();

    // A teammate's note appears in this open thread without a refresh. RLS
    // applies to realtime, so only workspace members receive it.
    const channel = supabase
      .channel(`contact-notes:${contactId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'contact_notes',
          filter: `contact_id=eq.${contactId}`,
        },
        (payload) => {
          const row = payload.new as ContactNote;
          setLoaded((prev) => {
            if (!prev || prev.contactId !== contactId) return prev;
            if (prev.notes.some((n) => n.id === row.id)) return prev;
            return { contactId, notes: [...prev.notes, row] };
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [contactId, accountId]);

  const notes = loaded && loaded.contactId === contactId ? loaded.notes : [];

  /** Save a note. Throws on failure so the composer can keep the text. */
  const addNote = useCallback(
    async (input: {
      text: string;
      userId: string;
      mentionedUserIds: string[];
      conversationId: string | null;
    }) => {
      if (!contactId || !accountId) throw new Error('No contact selected');
      const { data, error } = await createClient()
        .from('contact_notes')
        .insert({
          contact_id: contactId,
          account_id: accountId,
          user_id: input.userId,
          note_text: input.text,
          mentioned_user_ids: input.mentionedUserIds,
          conversation_id: input.conversationId,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      const row = data as ContactNote;
      // The realtime INSERT may have landed first; never double-add.
      setLoaded((prev) => {
        if (!prev || prev.contactId !== contactId) {
          return { contactId, notes: [row] };
        }
        if (prev.notes.some((n) => n.id === row.id)) return prev;
        return { contactId, notes: [...prev.notes, row] };
      });
    },
    [contactId, accountId]
  );

  return { notes, addNote };
}
