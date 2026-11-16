import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import type { Contact, Conversation, Message } from '@/types';

// RLS scopes a browser query to the caller's MEMBERSHIPS, not to one workspace
// (see apps/web/src/lib/workspace/scope.ts). Every account-scoped read below
// therefore names the workspace itself, and does not run until it is known:
// filtering on null returns nothing, which looks exactly like an empty inbox.

const CONVERSATION_SELECT = '*, contact:contacts(id, account_id, phone, ig_username, name, company)';

export function useConversations() {
  const { accountId } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!accountId) return;
    const ch = supabase
      .channel(`inbox:${accountId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `account_id=eq.${accountId}` },
        () => void qc.invalidateQueries({ queryKey: ['conversations', accountId] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [accountId, qc]);

  return useQuery({
    queryKey: ['conversations', accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<Conversation[]> => {
      const { data, error } = await supabase
        .from('conversations')
        .select(CONVERSATION_SELECT)
        .eq('account_id', accountId!)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Conversation[];
    },
  });
}

export function useConversation(id: string) {
  const { accountId } = useAuth();
  return useQuery({
    queryKey: ['conversation', accountId, id],
    enabled: !!accountId,
    queryFn: async (): Promise<Conversation> => {
      const { data, error } = await supabase
        .from('conversations')
        .select(CONVERSATION_SELECT)
        .eq('account_id', accountId!)
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as unknown as Conversation;
    },
  });
}

export function useMessages(conversationId: string) {
  const { accountId } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!accountId) return;
    const ch = supabase
      .channel(`thread:${accountId}:${conversationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        () => {
          void qc.invalidateQueries({ queryKey: ['messages', accountId, conversationId] });
          void qc.invalidateQueries({ queryKey: ['conversation', accountId, conversationId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [accountId, conversationId, qc]);

  return useQuery({
    queryKey: ['messages', accountId, conversationId],
    enabled: !!accountId,
    queryFn: async (): Promise<Message[]> => {
      // `messages` has no account filter of its own: it inherits the scope from
      // the conversation, which the screen only reaches via a workspace-scoped
      // conversation query. Newest first so FlatList can invert.
      const { data, error } = await supabase
        .from('messages')
        .select('id, conversation_id, sender_type, content_type, content_text, media_url, template_name, status, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Message[];
    },
  });
}

export function useContacts(search: string) {
  const { accountId } = useAuth();
  const term = search.trim().replace(/[%,()]/g, '');
  return useQuery({
    queryKey: ['contacts', accountId, term],
    enabled: !!accountId,
    queryFn: async (): Promise<Contact[]> => {
      let q = supabase
        .from('contacts')
        .select('id, account_id, phone, ig_username, name, company')
        .eq('account_id', accountId!)
        .order('created_at', { ascending: false })
        .limit(100);
      if (term) q = q.or(`name.ilike.%${term}%,phone.ilike.%${term}%,company.ilike.%${term}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Contact[];
    },
  });
}
