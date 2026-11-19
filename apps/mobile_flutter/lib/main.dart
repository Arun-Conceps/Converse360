// ignore: deprecated_member_use
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'core/config.dart';
import 'core/secure_storage.dart';
import 'core/theme.dart';
import 'router.dart';
import 'screens/lock_gate.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Draw under Android's gesture bar with no white scrim, so the floating nav
  // bar sits on the page rather than on a separate strip.
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    systemNavigationBarColor: Colors.transparent,
    systemNavigationBarDividerColor: Colors.transparent,
    systemNavigationBarContrastEnforced: false,
    systemNavigationBarIconBrightness: Brightness.dark,
  ));
  if (!Config.isSet) {
    runApp(const _MissingConfig());
    return;
  }
  await Supabase.initialize(
    url: Config.supabaseUrl,
    publishableKey: Config.supabaseAnonKey,
    authOptions: FlutterAuthClientOptions(localStorage: SecureSessionStorage()),
  );
  runApp(const ProviderScope(child: ConverseApp()));
}

class ConverseApp extends ConsumerWidget {
  const ConverseApp({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => MaterialApp.router(
    title: 'Converse360',
    theme: buildTheme(),
    routerConfig: ref.watch(routerProvider),
    debugShowCheckedModeBanner: false,
    builder: (_, child) => LockGate(child: child ?? const SizedBox.shrink()),
  );
}

class _MissingConfig extends StatelessWidget {
  const _MissingConfig();
  @override
  Widget build(BuildContext context) => const MaterialApp(
    home: Scaffold(
      body: Padding(
        padding: EdgeInsets.all(24),
        child: Center(
          child: Text(
            'Missing configuration.\n\nRun with:\nflutter run --dart-define-from-file=env.json\n\n(copy env.example.json to env.json)',
            textAlign: TextAlign.center,
          ),
        ),
      ),
    ),
  );
}
