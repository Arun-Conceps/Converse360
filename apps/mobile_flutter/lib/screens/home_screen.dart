import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/inbox_logic.dart';
import '../core/theme.dart';
import '../state/auth.dart';
import '../state/data.dart';
import '../state/data_more.dart';
import '../ui/widgets.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    final convs = ref.watch(conversationsProvider).value ?? const [];
    final unread = convs.fold<int>(0, (a, c) => a + c.unreadCount);
    final alerts =
        ref.watch(notificationsProvider).value?.where((n) => n.unread).length ?? 0;
    final attention = convs.where((c) => c.unreadCount > 0).take(5).toList();

    Widget stat(String label, int value) => Expanded(
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
                color: C.surface,
                border: Border.all(color: C.line),
                borderRadius: BorderRadius.circular(14)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('$value',
                  style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w600)),
              Text(label, style: const TextStyle(fontSize: 12, color: C.muted)),
            ]),
          ),
        );

    return Scaffold(
      appBar: AppBar(
        actions: [
          IconButton(
            tooltip: 'Notifications',
            onPressed: () => context.push('/notifications'),
            icon: Badge(
                isLabelVisible: alerts > 0,
                label: Text('$alerts'),
                child: const Icon(Icons.notifications_none)),
          ),
        ],
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Home'),
          if (auth.workspace != null)
            Text(auth.workspace!.name,
                style: const TextStyle(
                    fontSize: 12, color: C.muted, fontWeight: FontWeight.w400)),
        ]),
      ),
      body: Column(children: [
        if (auth.workspace?.standing == 'grace')
          const BannerStrip('Your last payment is late. The workspace still works.'),
        Expanded(
          child: ListView(padding: const EdgeInsets.all(14), children: [
            Row(spacing: 10, children: [
              stat('Unread', unread),
              stat('Open chats', convs.where((c) => !c.isClosed).length),
              stat('Assigned to me',
                  convs.where((c) => c.assignedAgentId == auth.userId).length),
            ]),
            const SizedBox(height: 16),
            const Text('NEEDS ATTENTION',
                style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.8,
                    color: C.muted)),
            const SizedBox(height: 6),
            ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: Container(
                decoration: BoxDecoration(border: Border.all(color: C.line)),
                child: attention.isEmpty
                    ? Container(
                        width: double.infinity,
                        color: C.surface,
                        padding: const EdgeInsets.all(16),
                        child: const Text('All caught up.',
                            style: TextStyle(color: C.muted)))
                    : Column(children: [
                        for (final c in attention)
                          InkWell(
                            onTap: () => context.push('/chat/${c.id}'),
                            child: Container(
                              constraints: const BoxConstraints(minHeight: kHit),
                              padding: const EdgeInsets.all(12),
                              decoration: const BoxDecoration(
                                  color: C.surface,
                                  border: Border(bottom: BorderSide(color: C.line))),
                              child: Row(spacing: 10, children: [
                                AppAvatar(contactName(c.contact)),
                                Expanded(
                                  child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(contactName(c.contact),
                                            style: const TextStyle(
                                                fontWeight: FontWeight.w600)),
                                        Text(c.lastMessageText ?? '',
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: const TextStyle(
                                                color: C.muted, fontSize: 12.5)),
                                      ]),
                                ),
                                Text('${c.unreadCount}',
                                    style: const TextStyle(
                                        color: C.accent,
                                        fontWeight: FontWeight.w600)),
                              ]),
                            ),
                          ),
                      ]),
              ),
            ),
          ]),
        ),
      ]),
    );
  }
}
