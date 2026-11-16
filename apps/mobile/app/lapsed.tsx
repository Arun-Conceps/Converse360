import { useRouter } from 'expo-router';
import { Linking, Text } from 'react-native';
import { Button, Center } from '@/components/ui';
import { useAuth } from '@/providers/auth';
import { colors } from '@/theme';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://app.converse360.example';

export default function Lapsed() {
  const { workspace, workspaces, signOut } = useAuth();
  const router = useRouter();
  return (
    <Center>
      <Text style={{ fontSize: 22, fontWeight: '700', color: colors.fg }}>This plan has lapsed</Text>
      <Text style={{ color: colors.muted, textAlign: 'center' }}>
        {workspace?.name} is locked until the owner pays. Billing happens on the web, not in the app.
      </Text>
      <Button title="Open billing on the web" kind="primary" onPress={() => void Linking.openURL(`${WEB_URL}/billing`)} />
      {workspaces.length > 1 ? <Button title="Switch workspace" onPress={() => router.push('/select-workspace')} /> : null}
      <Button title="Sign out" onPress={() => void signOut().then(() => router.replace('/'))} />
    </Center>
  );
}
