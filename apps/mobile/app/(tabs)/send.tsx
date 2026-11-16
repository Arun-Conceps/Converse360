import { SafeAreaView } from 'react-native-safe-area-context';
import { AppBar, Empty } from '@/components/ui';
import { colors } from '@/theme';

// P1 (spec 3.5): broadcast list, create, schedule, report. Opt-out exclusion
// must ship WITH broadcasts, so this stays a stub until the consent columns land.
export default function Send() {
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Send" sub="Broadcasts and templates" />
      <Empty title="Coming next" hint="Broadcasts ship together with opt-out handling so nobody who said STOP is messaged." />
    </SafeAreaView>
  );
}
