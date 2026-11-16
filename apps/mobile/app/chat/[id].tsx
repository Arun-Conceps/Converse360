import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/lib/api';
import { channelOf, contactName, isReplyWindowOpen, SEND_PATH } from '@/lib/inbox';
import { useConversation, useMessages } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { Avatar, Banner, Empty, Pill } from '@/components/ui';
import { useAuth } from '@/providers/auth';
import { colors, HIT } from '@/theme';
import type { Message } from '@/types';

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const tick = (m: Message) =>
  m.sender_type === 'customer' ? '' : m.status === 'read' ? '✓✓ read' : m.status === 'delivered' ? '✓✓' : m.status === 'failed' ? '! failed' : m.status === 'sending' ? '…' : '✓';

function preview(m: Message): string {
  if (m.content_text) return m.content_text;
  if (m.content_type === 'template') return `Template: ${m.template_name ?? ''}`;
  return `[${m.content_type}]`;
}

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { accountId } = useAuth();
  const conv = useConversation(id);
  const msgs = useMessages(id);
  const [text, setText] = useState('');

  const c = conv.data;
  const channel = c ? channelOf(c) : 'whatsapp';
  const open = c ? isReplyWindowOpen(c) : false;
  const name = contactName(c?.contact);
  const hasUnread = (c?.unread_count ?? 0) > 0;

  // Opening a thread reads it. Guarded on `hasUnread` so it cannot loop: once the
  // count is 0 the condition is false and no further UPDATE is issued.
  useEffect(() => {
    if (!accountId || !hasUnread) return;
    void supabase
      .from('conversations')
      .update({ unread_count: 0 })
      .eq('account_id', accountId)
      .eq('id', id)
      .then(() => qc.invalidateQueries({ queryKey: ['conversations', accountId] }));
  }, [accountId, id, hasUnread, qc]);

  const send = useMutation({
    mutationFn: (body: string) =>
      api(SEND_PATH[channel], {
        method: 'POST',
        body: { conversation_id: id, message_type: 'text', content_text: body },
      }),
    onSuccess: () => {
      setText('');
      void qc.invalidateQueries({ queryKey: ['messages', accountId, id] });
    },
  });

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={{ width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={24} color={colors.fg} />
        </Pressable>
        <Avatar name={name} size={34} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', fontSize: 16 }} numberOfLines={1}>{name}</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>{c?.contact?.phone ?? channel}</Text>
        </View>
        <Pill tone={c?.status === 'closed' ? 'plain' : 'ok'}>{c?.status === 'closed' ? 'Closed' : 'Open'}</Pill>
      </View>

      {c && !open ? <Banner>The 24-hour window is closed. Only an approved template can be sent.</Banner> : null}

      {msgs.isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : msgs.error ? (
        <Empty title="Could not load messages" hint={(msgs.error as Error).message} />
      ) : (
        <FlatList
          inverted
          data={msgs.data}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12, gap: 6 }}
          ListEmptyComponent={<Empty title="No messages yet" />}
          renderItem={({ item: m }) => {
            const mine = m.sender_type !== 'customer';
            return (
              <View
                style={{
                  alignSelf: mine ? 'flex-end' : 'flex-start',
                  maxWidth: '80%',
                  paddingVertical: 7,
                  paddingHorizontal: 10,
                  borderRadius: 12,
                  backgroundColor: mine ? colors.out : colors.surface,
                  borderWidth: mine ? 0 : 1,
                  borderColor: colors.line,
                }}
              >
                <Text>{preview(m)}</Text>
                <Text style={{ fontSize: 10.5, color: m.status === 'failed' ? colors.bad : colors.muted, textAlign: 'right' }}>
                  {m.sender_type === 'bot' ? 'AI agent · ' : ''}
                  {time(m.created_at)} {tick(m)}
                </Text>
              </View>
            );
          }}
        />
      )}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {send.error ? (
          <Text style={{ color: colors.bad, paddingHorizontal: 14, paddingTop: 6 }}>
            {(send.error as Error).message} Tap send to retry.
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 6, padding: 10, alignItems: 'center', backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line }}>
          <TextInput
            value={text}
            onChangeText={setText}
            editable={open}
            multiline
            placeholder={open ? 'Message' : 'Window closed — template only'}
            accessibilityLabel="Message"
            style={{ flex: 1, maxHeight: 120, minHeight: HIT, borderWidth: 1, borderColor: colors.line, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: open ? colors.surface : colors.surface2 }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            disabled={!open || !text.trim() || send.isPending}
            onPress={() => send.mutate(text.trim())}
            style={{ width: HIT, height: HIT, borderRadius: HIT / 2, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', opacity: !open || !text.trim() || send.isPending ? 0.4 : 1 }}
          >
            {send.isPending ? <ActivityIndicator color={colors.accentFg} /> : <Ionicons name="send" size={18} color={colors.accentFg} />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
