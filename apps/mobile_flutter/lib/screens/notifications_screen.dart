import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/inbox_logic.dart';
import '../core/theme.dart';
import '../state/auth.dart';
import '../state/data_more.dart';
import '../ui/widgets.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final n = ref.watch(notificationsProvider);
    final accountId = ref.watch(accountIdProvider);
    final unread = n.value?.where((x) => x.unread).length ?? 0;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        leading: IconButton(
            icon: const Icon(Icons.chevron_left, size: 28),
            onPressed: () => context.pop()),
        actions: [
          if (unread > 0 && accountId != null)
            TextButton(
              onPressed: () async {
                await markAllNotificationsRead(accountId);
                ref.invalidate(notificationsProvider);
              },
              child: const Text('Mark all read'),
            ),
        ],
      ),
      body: n.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => EmptyState('Could not load notifications', hint: '$e'),
        data: (list) => list.isEmpty
            ? const EmptyState('Nothing yet',
                hint: 'Assignments and @mentions show up here.')
            : ListView.builder(
                itemCount: list.length,
                itemBuilder: (_, i) {
                  final x = list[i];
                  return ListTile(
                    tileColor: x.unread ? C.accentSoft : C.surface,
                    leading: Icon(
                        x.type == 'note_mention'
                            ? Icons.alternate_email
                            : x.type == 'conversation_assigned'
                                ? Icons.person_add_alt
                                : Icons.bolt,
                        color: C.accent),
                    title: Text(x.title,
                        style: TextStyle(
                            fontWeight: x.unread ? FontWeight.w700 : FontWeight.w400)),
                    subtitle: x.body == null ? null : Text(x.body!, maxLines: 2),
                    trailing: Text(relativeTime(x.createdAt),
                        style: const TextStyle(color: C.muted, fontSize: 12)),
                    onTap: () async {
                      if (x.unread) {
                        await markNotificationRead(x.id);
                        ref.invalidate(notificationsProvider);
                      }
                      if (x.conversationId != null && context.mounted) {
                        context.push('/chat/${x.conversationId}');
                      }
                    },
                  );
                },
              ),
      ),
    );
  }
}
