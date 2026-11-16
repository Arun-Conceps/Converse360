import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppBar, Avatar, Banner } from '@/components/ui';
import { contactName } from '@/lib/inbox';
import { useConversations } from '@/lib/queries';
import { useAuth } from '@/providers/auth';
import { colors } from '@/theme';

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <View style={{ flex: 1, minWidth: '45%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: '600' }}>{value}</Text>
      <Text style={{ fontSize: 12, color: colors.muted }}>{label}</Text>
    </View>
  );
}

export default function Home() {
  const router = useRouter();
  const { workspace, userId } = useAuth();
  const { data } = useConversations();
  const convs = data ?? [];
  const unread = convs.reduce((a, c) => a + c.unread_count, 0);
  const attention = convs.filter((c) => c.unread_count > 0).slice(0, 5);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Home" sub={workspace?.name} />
      {workspace?.standing === 'grace' ? <Banner>Your last payment is late. The workspace still works.</Banner> : null}
      <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Stat value={unread} label="Unread" />
          <Stat value={convs.filter((c) => c.status !== 'closed').length} label="Open chats" />
          <Stat value={convs.filter((c) => c.assigned_agent_id === userId).length} label="Assigned to me" />
        </View>
        <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.8, color: colors.muted }}>NEEDS ATTENTION</Text>
        <View style={{ borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.line }}>
          {attention.length === 0 ? (
            <Text style={{ padding: 16, color: colors.muted, backgroundColor: colors.surface }}>All caught up.</Text>
          ) : (
            attention.map((c) => (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.id } })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, minHeight: 44, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line }}
              >
                <Avatar name={contactName(c.contact)} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600' }}>{contactName(c.contact)}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12.5 }} numberOfLines={1}>{c.last_message_text}</Text>
                </View>
                <Text style={{ color: colors.accent, fontWeight: '600' }}>{c.unread_count}</Text>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
