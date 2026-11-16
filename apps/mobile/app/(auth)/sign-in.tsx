import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui';
import { useAuth } from '@/providers/auth';
import { colors } from '@/theme';

export default function SignIn() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    const msg = await signIn(email, password);
    setBusy(false);
    if (msg) setErr(msg);
    else router.replace('/');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.wrap}>
        <View style={s.logo}>
          <Text style={{ color: colors.accentFg, fontSize: 22, fontWeight: '700' }}>C</Text>
        </View>
        <View>
          <Text style={s.h1}>Converse360</Text>
          <Text style={{ color: colors.muted }}>Your team inbox, in your pocket.</Text>
        </View>
        <Text style={s.label}>Email</Text>
        <TextInput
          style={s.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          accessibilityLabel="Email"
        />
        <Text style={s.label}>Password</Text>
        <TextInput
          style={s.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          accessibilityLabel="Password"
          onSubmitEditing={submit}
        />
        {err ? <Text style={{ color: colors.bad }}>{err}</Text> : null}
        <Button title="Sign in" kind="primary" onPress={submit} loading={busy} disabled={!email || !password} />
        <Text style={{ color: colors.muted, fontSize: 12, textAlign: 'center' }}>
          Same login as the web app. Settings and billing stay on the web.
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, padding: 22, justifyContent: 'center', gap: 10 },
  logo: { width: 56, height: 56, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  h1: { fontSize: 26, fontWeight: '700', color: colors.fg },
  label: { fontSize: 12, color: colors.muted, fontWeight: '500' },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12, minHeight: 44 },
});
