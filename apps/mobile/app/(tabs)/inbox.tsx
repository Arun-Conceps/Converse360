import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppBar, Avatar, Empty, Pill } from '@/components/ui';
import { channelOf, contactName, isReplyWindowOpen, matchesFilter, relativeTime, type InboxFilter } from '@/lib/inbox';
import { useConversations } from '@/lib/queries';
import { useAuth } from '@/providers/auth';
import { colors, HIT } from '@/theme';

const FILTERS: { key: InboxFilter; label: string }[] = [
  { key: 'mine', label: 'Mine' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
];
const CHANNEL_LABEL = { whatsapp: 'WhatsApp', instagram: 'Instagram', web: 'Web chat' } as const;

export default function Inbox() {
  const router = useRouter();
  const { userId, workspace } = useAuth();
  const { data, isLoading, isRefetching, refetch, error } = useConversations();
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data ?? []).filter(
      (c) =>
        matchesFilter(c, filter, userId ?? '') &&
        (!needle || `${contactName(c.contact)} ${c.last_message_text ?? ''}`.toLowerCase().includes(needle)),
    );
  }, [data, filter, q, userId]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Inbox" sub={workspace?.name} />
      <View style={{ padding: 10, backgroundColor: colors.surface }}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search chats"
          accessibilityLabel="Search chats"
          style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 10, minHeight: HIT }}
        />
      </View>
      <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingBottom: 8, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === f.key }}
            onPress={() => setFilter(f.key)}
            style={{
              paddingHorizontal: 12,
              minHeight: 32,
              justifyContent: 'center',
              borderRadius: 99,
              borderWidth: 1,
              borderColor: filter === f.key ? colors.accent : colors.line,
              backgroundColor: filter === f.key ? colors.accent : colors.surface,
            }}
          >
            <Text style={{ fontSize: 12.5, color: filter === f.key ? colors.accentFg : colors.muted, fontWeight: filter === f.key ? '600' : '400' }}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : error ? (
        <Empty title="Could not load chats" hint={(error as Error).message} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(c) => c.id}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
          ListEmptyComponent={<Empty title="No chats here" hint="Try another filter." />}
          renderItem={({ item: c }) => {
            const name = contactName(c.contact);
            const ch = channelOf(c);
            return (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.id } })}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  gap: 10,
                  padding: 12,
                  minHeight: HIT,
                  backgroundColor: pressed ? colors.surface2 : colors.surface,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.line,
                })}
              >
                <Avatar name={name} />
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontWeight: '600', flex: 1 }} numberOfLines={1}>{name}</Text>
                    <Text style={{ fontSize: 11.5, color: colors.muted }}>{relativeTime(c.last_message_at)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={{ color: colors.muted, fontSize: 12.5, flex: 1 }} numberOfLines={1}>
                      {c.last_message_text ?? 'No messages yet'}
                    </Text>
                    {c.unread_count > 0 ? (
                      <View style={{ backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 6 }}>
                        <Text style={{ color: colors.accentFg, fontSize: 11, fontWeight: '600' }}>{c.unread_count}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 4, marginTop: 2 }}>
                    <Pill>{CHANNEL_LABEL[ch]}</Pill>
                    {!isReplyWindowOpen(c) ? <Pill tone="warn">Window closed</Pill> : null}
                    {c.status === 'closed' ? <Pill>Closed</Pill> : null}
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
