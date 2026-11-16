import { Redirect } from 'expo-router';
import { ActivityIndicator, Text } from 'react-native';
import { Button, Center } from '@/components/ui';
import { useAuth } from '@/providers/auth';

// The one place that decides where a launch lands, from the auth state machine.
export default function Gate() {
  const { status, error, refresh, signOut, workspace } = useAuth();
  switch (status) {
    case 'loading':
      return (
        <Center>
          <ActivityIndicator />
        </Center>
      );
    case 'signedOut':
      return <Redirect href="/sign-in" />;
    case 'needsPick':
    case 'noWorkspace':
      return <Redirect href="/select-workspace" />;
    case 'error':
      return (
        <Center>
          <Text style={{ textAlign: 'center' }}>{error}</Text>
          <Button title="Try again" onPress={() => void refresh()} kind="primary" />
          <Button title="Sign out" onPress={() => void signOut()} />
        </Center>
      );
    default:
      // A lapsed plan is read-only; billing happens on the web, never in the app.
      return workspace?.standing === 'lapsed' ? <Redirect href="/lapsed" /> : <Redirect href="/(tabs)/inbox" />;
  }
}
