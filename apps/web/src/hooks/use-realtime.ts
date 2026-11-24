"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message, Conversation, Contact } from "@/types";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  accountRealtimeFilter,
  rowBelongsToWorkspace,
} from "@/lib/workspace/realtime-scope";

interface RealtimeEvent<T> {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: T;
  old: Partial<T>;
}

interface UseRealtimeOptions {
  channelName: string;
  /**
   * Active workspace. Realtime follows RLS (memberships), so without this a
   * multi-workspace user receives every workspace's events. Nothing is
   * subscribed until it is known, and the channel is rebuilt when it changes.
   */
  accountId: string | null | undefined;
  onMessageEvent?: (event: RealtimeEvent<Message>) => void;
  onConversationEvent?: (event: RealtimeEvent<Conversation>) => void;
  /**
   * Contact rows changing under an open inbox.
   *
   * Needed because an Instagram contact is created named by its IGSID
   * and renamed later, once Meta will answer for them (see
   * InstagramIdentityService.upgradePlaceholderName). Without this the
   * upgrade is invisible until a full page reload, and the inbox goes on
   * showing a 16-digit number for a person we now know the name of.
   */
  onContactEvent?: (event: RealtimeEvent<Contact>) => void;
  enabled?: boolean;
}

export function useRealtime({
  channelName,
  accountId,
  onMessageEvent,
  onConversationEvent,
  onContactEvent,
  enabled = true,
}: UseRealtimeOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Store latest callbacks in refs to avoid re-subscribing when the
  // parent re-renders with fresh closures. Assigned inside an effect
  // so the mutation doesn't happen during render (React 19's refs
  // rule) — subscribers only read `.current` inside async Realtime
  // callbacks, which always run after the render that updates it.
  const onMessageRef = useRef(onMessageEvent);
  const onConversationRef = useRef(onConversationEvent);
  const onContactRef = useRef(onContactEvent);
  useEffect(() => {
    onMessageRef.current = onMessageEvent;
    onConversationRef.current = onConversationEvent;
    onContactRef.current = onContactEvent;
  });

  useEffect(() => {
    if (!enabled || !accountId) return;
    const filter = accountRealtimeFilter(accountId);

    const supabase = createClient();

    const channel = supabase
      .channel(`${channelName}:${accountId}`)
      .on(
        // `messages` has no account_id column, so it cannot be filtered
        // here; consumers must resolve the conversation's workspace.
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        (payload) => {
          onMessageRef.current?.({
            eventType: payload.eventType as RealtimeEvent<Message>["eventType"],
            new: payload.new as Message,
            old: payload.old as Partial<Message>,
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations", filter },
        (payload) => {
          if (!rowBelongsToWorkspace(payload.new as Conversation, accountId)) return;
          onConversationRef.current?.({
            eventType: payload.eventType as RealtimeEvent<Conversation>["eventType"],
            new: payload.new as Conversation,
            old: payload.old as Partial<Conversation>,
          });
        }
      )
      .on(
        "postgres_changes",
        // UPDATE only: a new contact reaches the inbox through the
        // conversation that carries it, so INSERT here would be a second
        // path to the same row and DELETE is handled by the conversation
        // cascade.
        { event: "UPDATE", schema: "public", table: "contacts", filter },
        (payload) => {
          if (!rowBelongsToWorkspace(payload.new as Contact, accountId)) return;
          onContactRef.current?.({
            eventType: "UPDATE",
            new: payload.new as Contact,
            old: payload.old as Partial<Contact>,
          });
        }
      )
      .subscribe((status) => {
        setIsConnected(status === "SUBSCRIBED");
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      setIsConnected(false);
    };
  }, [channelName, enabled, accountId]);

  const unsubscribe = useCallback(() => {
    if (channelRef.current) {
      const supabase = createClient();
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
      setIsConnected(false);
    }
  }, []);

  return { isConnected, unsubscribe };
}
