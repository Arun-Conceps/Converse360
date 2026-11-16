import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/config.dart';
import '../core/theme.dart';
import '../state/auth.dart';
import '../ui/widgets.dart';

class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final a = ref.watch(authProvider);
    final w = a.workspace;
    return Scaffold(
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('More'),
          if (a.email != null)
            Text(a.email!,
                style: const TextStyle(
                    fontSize: 12, color: C.muted, fontWeight: FontWeight.w400)),
        ]),
      ),
      body: ListView(padding: const EdgeInsets.all(14), children: [
        InkWell(
          onTap: () => context.push('/select-workspace'),
          borderRadius: BorderRadius.circular(14),
          child: Container(
            constraints: const BoxConstraints(minHeight: kHit),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
                color: C.surface,
                border: Border.all(color: C.line),
                borderRadius: BorderRadius.circular(14)),
            child: Row(spacing: 10, children: [
              AppAvatar(w?.name ?? '?'),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(w?.name ?? '',
                      style: const TextStyle(fontWeight: FontWeight.w600)),
                  Text(
                      a.workspaces.length > 1
                          ? 'Switch workspace'
                          : 'Your role: ${w?.role ?? ''}',
                      style: const TextStyle(color: C.muted, fontSize: 12.5)),
                ]),
              ),
            ]),
          ),
        ),
        const SizedBox(height: 12),
        for (final r in const [
          (Icons.view_kanban_outlined, 'Deals', 'Pipeline board', '/deals'),
          (Icons.notifications_none, 'Notifications', 'Assignments and @mentions', '/notifications'),
          (Icons.bolt_outlined, 'Quick replies', 'Saved replies for the / shortcut', '/quick-replies'),
        ])
          ListTile(
            tileColor: C.surface,
            leading: Icon(r.$1, color: C.accent),
            title: Text(r.$2, style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text(r.$3),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(r.$4),
          ),
        const SizedBox(height: 12),
        AppButton('Open the web dashboard',
            onPressed: () => launchUrl(Uri.parse(Config.webUrl),
                mode: LaunchMode.externalApplication)),
        const SizedBox(height: 12),
        AppButton('Sign out',
            danger: true, onPressed: ref.read(authProvider.notifier).signOut),
        const SizedBox(height: 12),
        const Center(
            child: Text('Converse360 0.1.0 (MVP)',
                style: TextStyle(color: C.muted, fontSize: 12))),
      ]),
    );
  }
}
