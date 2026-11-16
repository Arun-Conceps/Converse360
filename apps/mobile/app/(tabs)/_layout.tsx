import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { colors } from '@/theme';
import { useAuth } from '@/providers/auth';

const icon =
  (name: keyof typeof Ionicons.glyphMap) =>
  ({ color, size }: { color: string; size: number }) => <Ionicons name={name} color={color} size={size} />;

export default function TabsLayout() {
  const { accountId } = useAuth();
  return (
    // Keyed by workspace: switching remounts every tab, which tears down their
    // realtime channels and drops their state. A soft switch that kept them
    // would deliver one client's messages into another's inbox.
    <Tabs
      key={accountId}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
        tabBarLabelStyle: { fontSize: 10.5 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home-outline') }} />
      <Tabs.Screen name="inbox" options={{ title: 'Inbox', tabBarIcon: icon('chatbubble-outline') }} />
      <Tabs.Screen name="contacts" options={{ title: 'Contacts', tabBarIcon: icon('people-outline') }} />
      <Tabs.Screen name="send" options={{ title: 'Send', tabBarIcon: icon('megaphone-outline') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('ellipsis-horizontal') }} />
    </Tabs>
  );
}
