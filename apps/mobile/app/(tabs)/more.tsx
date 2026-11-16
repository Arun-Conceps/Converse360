import { useRouter } from 'expo-router';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppBar, Avatar, Button } from '@/components/ui';
import { useAuth } from '@/providers/auth';
import { colors, HIT } from '@/theme';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://app.converse360.example';

export default function More() {
  const router = useRouter();
  const { workspace, workspaces, session, signOut } = useAuth();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="More" sub={session?.user.email} />
      <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/select-workspace')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, minHeight: HIT, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 14 }}
        >
          <Avatar name={workspace?.name ?? '?'} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600' }}>{workspace?.name}</Text>
            <Text style={{ color: colors.muted, fontSize: 12.5 }}>
              {workspaces.length > 1 ? 'Switch workspace' : `Your role: ${workspace?.role}`}
            </Text>
          </View>
        </Pressable>
        <Button title="Open the web dashboard" onPress={() => void Linking.openURL(WEB_URL)} />
        <Button title="Sign out" kind="danger" onPress={() => void signOut().then(() => router.replace('/'))} />
        <Text style={{ textAlign: 'center', color: colors.muted, fontSize: 12 }}>Converse360 0.1.0 (MVP)</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
