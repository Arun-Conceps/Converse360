import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/config.dart';
import '../core/theme.dart';
import '../state/auth.dart';
import '../ui/widgets.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});
  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: Center(child: CircularProgressIndicator()));
}

class ErrorScreen extends ConsumerWidget {
  const ErrorScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final a = ref.watch(authProvider);
    final auth = ref.read(authProvider.notifier);
    return CenteredPage(children: [
      Text(a.error ?? 'Something went wrong', textAlign: TextAlign.center),
      AppButton('Try again', primary: true, onPressed: auth.retry),
      AppButton('Sign out', onPressed: auth.signOut),
    ]);
  }
}

class LapsedScreen extends ConsumerWidget {
  const LapsedScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final a = ref.watch(authProvider);
    return CenteredPage(children: [
      const Text('This plan has lapsed',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
      Text(
        '${a.workspace?.name ?? 'This workspace'} is locked until the owner pays. Billing happens on the web, not in the app.',
        textAlign: TextAlign.center,
        style: const TextStyle(color: C.muted),
      ),
      AppButton('Open billing on the web',
          primary: true,
          onPressed: () => launchUrl(Uri.parse('${Config.webUrl}/billing'),
              mode: LaunchMode.externalApplication)),
      if (a.workspaces.length > 1)
        AppButton('Switch workspace',
            onPressed: () => context.push('/select-workspace')),
      AppButton('Sign out', onPressed: ref.read(authProvider.notifier).signOut),
    ]);
  }
}
