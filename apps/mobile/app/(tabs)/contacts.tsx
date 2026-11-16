import { useState } from 'react';
import { ActivityIndicator, FlatList, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppBar, Avatar, Empty } from '@/components/ui';
import { contactName } from '@/lib/inbox';
import { useContacts } from '@/lib/queries';
import { colors, HIT } from '@/theme';

export default function Contacts() {
  const [q, setQ] = useState('');
  const { data, isLoading, error } = useContacts(q);
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Contacts" sub={data ? `${data.length}${data.length === 100 ? '+' : ''} people` : undefined} />
      <View style={{ padding: 10, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search name, phone or company"
          accessibilityLabel="Search contacts"
          style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 10, minHeight: HIT, backgroundColor: colors.surface }}
        />
      </View>
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : error ? (
        <Empty title="Could not load contacts" hint={(error as Error).message} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(c) => c.id}
          ListEmptyComponent={<Empty title="No matches" />}
          renderItem={({ item: c }) => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, minHeight: HIT, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line }}>
              <Avatar name={contactName(c)} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600' }}>{contactName(c)}</Text>
                <Text style={{ color: colors.muted, fontSize: 12.5 }} numberOfLines={1}>
                  {[c.phone, c.company].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
