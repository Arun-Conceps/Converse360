import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { initials } from '@/lib/inbox';
import { colors, HIT, radius } from '@/theme';

export function Avatar({ name, size = 42 }: { name: string; size?: number }) {
  return (
    <View style={[s.av, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[s.avText, { fontSize: size * 0.33 }]}>{initials(name)}</Text>
    </View>
  );
}

export function Pill({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'ok' | 'warn' | 'bad' }) {
  const bg = { plain: colors.surface2, ok: colors.accentSoft, warn: colors.warnSoft, bad: colors.badSoft }[tone];
  const fg = { plain: colors.muted, ok: colors.accent, warn: colors.warn, bad: colors.bad }[tone];
  return (
    <View style={[s.pill, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 11, fontWeight: '500' }}>{children}</Text>
    </View>
  );
}

export function Button({
  title,
  onPress,
  kind = 'default',
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: 'default' | 'primary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const primary = kind === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        s.btn,
        primary && { backgroundColor: colors.accent, borderColor: colors.accent },
        (disabled || loading) && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? colors.accentFg : colors.fg} />
      ) : (
        <Text style={{ fontWeight: '600', color: primary ? colors.accentFg : kind === 'danger' ? colors.bad : colors.fg }}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Banner({ children, tone = 'warn' }: { children: ReactNode; tone?: 'warn' | 'ok' }) {
  return (
    <View style={{ backgroundColor: tone === 'warn' ? colors.warnSoft : colors.accentSoft, paddingHorizontal: 14, paddingVertical: 8 }}>
      <Text style={{ color: tone === 'warn' ? colors.warn : colors.accent, fontSize: 12.5 }}>{children}</Text>
    </View>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={{ padding: 30, alignItems: 'center', gap: 6 }}>
      <Text style={{ fontWeight: '600', color: colors.fg }}>{title}</Text>
      {hint ? <Text style={{ color: colors.muted, textAlign: 'center' }}>{hint}</Text> : null}
    </View>
  );
}

export function Center({ children }: { children: ReactNode }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: colors.bg }}>
      {children}
    </View>
  );
}

export function AppBar({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 19, fontWeight: '700', color: colors.fg }} numberOfLines={1}>
          {title}
        </Text>
        {sub ? <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const s = StyleSheet.create({
  av: { backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  avText: { color: colors.accent, fontWeight: '600' },
  pill: { paddingHorizontal: 8, paddingVertical: 1, borderRadius: radius.pill, alignSelf: 'flex-start' },
  btn: {
    minHeight: HIT,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
});
