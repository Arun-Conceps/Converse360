import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar, Button, Pill } from '@/components/ui';
import { useAuth } from '@/providers/auth';
import { colors, HIT } from '@/theme';
import type { Workspace } from '@/types';

// Standing is colour AND text (spec section 4). `grace` is dunning and still
// entitled, so it is never painted like `lapsed`.
export function standingLabel(w: Workspace): { text: string; tone: 'ok' | 'warn' | 'bad' } {
  if (w.standing === 'lapsed') return { text: 'Plan lapsed', tone: 'bad' };
  if (w.standing === 'grace') return { text: 'Payment late, still working', tone: 'warn' };
  if (w.subscription_status === 'trial') return { text: 'Trial', tone: 'warn' };
  return { text: 'Active', tone: 'ok' };
}

export default function SelectWorkspace() {
  const { workspaces, selectWorkspace, signOut, status } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function pick(id: string) {
    setBusy(id);
    setErr(null);
    try {
      await selectWorkspace(id);
      router.replace('/');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not switch workspace');
    } finally {
      setBusy(null);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 22, gap: 14, flexGrow: 1 }}>
        {status === 'noWorkspace' ? (
          <View style={{ gap: 10, marginTop: 40 }}>
            <Text style={{ fontSize: 22, fontWeight: '700' }}>No workspace yet</Text>
            <Text style={{ color: colors.muted }}>
              You are not a member of any workspace. Ask the owner for an invitation link, then open it on this phone.
            </Text>
          </View>
        ) : (
          <View>
            <Text style={{ fontSize: 22, fontWeight: '700' }}>Choose a workspace</Text>
            <Text style={{ color: colors.muted }}>You belong to {workspaces.length}. You can switch any time.</Text>
          </View>
        )}
        <View style={{ borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.line }}>
          {workspaces.map((w) => {
            const st = standingLabel(w);
            return (
              <Pressable
                key={w.id}
                accessibilityRole="button"
                onPress={() => pick(w.id)}
                disabled={busy !== null}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  padding: 14,
                  minHeight: HIT,
                  backgroundColor: colors.surface,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.line,
                  opacity: busy && busy !== w.id ? 0.5 : 1,
                }}
              >
                <Avatar name={w.name} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600' }}>{w.name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12.5 }}>
                    {w.plan_name ?? 'No plan'} · {w.role}
                  </Text>
                </View>
                <Pill tone={st.tone}>{st.text}</Pill>
              </Pressable>
            );
          })}
        </View>
        {err ? <Text style={{ color: colors.bad }}>{err}</Text> : null}
        <Button title="Sign out" onPress={() => void signOut().then(() => router.replace('/'))} />
      </ScrollView>
    </SafeAreaView>
  );
}
