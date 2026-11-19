import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/inbox_logic.dart';
import '../core/models_more.dart';
import '../core/theme.dart';
import '../state/auth.dart';
import '../state/data_more.dart';
import '../ui/widgets.dart';

/// Notifications grouped by day. Unread ones are tinted and carry a dot; the
/// label under each title says what kind of thing happened.
class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  static (IconData, String) _kind(String type) => switch (type) {
        'note_mention' => (Icons.alternate_email, 'Mention'),
        'conversation_assigned' => (Icons.person_add_alt_1_outlined, 'Assigned to you'),
        'automation' => (Icons.bolt_outlined, 'Automation'),
        _ => (Icons.notifications_none, 'Update'),
      };

  static String _day(DateTime t) {
    final now = DateTime.now();
    final d = DateTime(t.year, t.month, t.day);
    final today = DateTime(now.year, now.month, now.day);
    final diff = today.difference(d).inDays;
    if (diff <= 0) return 'Today';
    if (diff == 1) return 'Yesterday';
    if (diff < 7) return 'This week';
    return 'Earlier';
  }

  Future<void> _open(BuildContext context, WidgetRef ref, AppNotification x) async {
    if (x.unread) {
      await markNotificationRead(x.id);
      ref.invalidate(notificationsProvider);
    }
    if (x.conversationId != null && context.mounted) {
      context.push('/chat/${x.conversationId}');
    }
  }

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
      ),
      body: n.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => EmptyState('Could not load notifications', hint: '$e'),
        data: (list) {
          if (list.isEmpty) return const _Empty();
          // Keep the server's newest-first order; split into day groups.
          final groups = <String, List<AppNotification>>{};
          for (final x in list) {
            groups.putIfAbsent(_day(x.createdAt), () => []).add(x);
          }
          return RefreshIndicator(
            onRefresh: () async => ref.refresh(notificationsProvider.future),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              children: [
                _TopBar(
                  unread: unread,
                  total: list.length,
                  onMarkAll: unread > 0 && accountId != null
                      ? () async {
                          await markAllNotificationsRead(accountId);
                          ref.invalidate(notificationsProvider);
                        }
                      : null,
                ),
                for (final g in groups.entries) ...[
                  Padding(
                    padding: const EdgeInsets.fromLTRB(6, 20, 6, 8),
                    child: Text(g.key.toUpperCase(),
                        style: const TextStyle(
                            color: C.muted,
                            fontSize: 11.5,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.8)),
                  ),
                  Container(
                    decoration: BoxDecoration(
                      color: C.surface,
                      borderRadius: BorderRadius.circular(18),
                      boxShadow: [
                        BoxShadow(
                            color: Colors.black.withValues(alpha: 0.04),
                            blurRadius: 10,
                            offset: const Offset(0, 3)),
                      ],
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: Column(children: [
                      for (var i = 0; i < g.value.length; i++) ...[
                        if (i > 0) const Divider(height: 1, indent: 70),
                        _Row(
                          x: g.value[i],
                          kind: _kind(g.value[i].type),
                          onTap: () => _open(context, ref, g.value[i]),
                        ),
                      ],
                    ]),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({required this.unread, required this.total, this.onMarkAll});
  final int unread;
  final int total;
  final VoidCallback? onMarkAll;

  @override
  Widget build(BuildContext context) => Row(children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(
              color: unread > 0 ? C.accent : C.surface2,
              borderRadius: BorderRadius.circular(99)),
          child: Row(mainAxisSize: MainAxisSize.min, spacing: 6, children: [
            Icon(
                unread > 0
                    ? Icons.mark_email_unread_outlined
                    : Icons.done_all,
                size: 16,
                color: unread > 0 ? Colors.white : C.muted),
            Text(unread > 0 ? '$unread unread' : 'All caught up',
                style: TextStyle(
                    color: unread > 0 ? Colors.white : C.muted,
                    fontWeight: FontWeight.w700,
                    fontSize: 13)),
          ]),
        ),
        const SizedBox(width: 8),
        Text('of $total',
            style: const TextStyle(color: C.muted, fontSize: 12.5)),
        const Spacer(),
        if (onMarkAll != null)
          TextButton.icon(
            onPressed: onMarkAll,
            style: TextButton.styleFrom(
                foregroundColor: C.accent,
                minimumSize: const Size(0, kHit),
                textStyle: const TextStyle(fontWeight: FontWeight.w700)),
            icon: const Icon(Icons.done_all, size: 18),
            label: const Text('Mark all read'),
          ),
      ]);
}

class _Row extends StatelessWidget {
  const _Row({required this.x, required this.kind, required this.onTap});
  final AppNotification x;
  final (IconData, String) kind;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final unread = x.unread;
    return Material(
      color: unread ? C.accentSoft.withValues(alpha: 0.45) : C.surface,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 14, 12, 14),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, spacing: 14, children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                  color: unread ? C.accent : C.accentSoft,
                  borderRadius: BorderRadius.circular(12)),
              child: Icon(kind.$1,
                  size: 21, color: unread ? Colors.white : C.accent),
            ),
            Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: 3,
                  children: [
                    Row(spacing: 8, children: [
                      Expanded(
                        child: Text(x.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                fontSize: 15,
                                color: C.fg,
                                fontWeight: unread
                                    ? FontWeight.w800
                                    : FontWeight.w600)),
                      ),
                      Text(relativeTime(x.createdAt),
                          style: TextStyle(
                              color: unread ? C.accent : C.muted,
                              fontSize: 12,
                              fontWeight:
                                  unread ? FontWeight.w700 : FontWeight.w500)),
                      if (unread)
                        Container(
                            width: 8,
                            height: 8,
                            decoration: const BoxDecoration(
                                color: C.accent, shape: BoxShape.circle)),
                    ]),
                    if (x.body != null && x.body!.trim().isNotEmpty)
                      Text(x.body!,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              color: C.muted, fontSize: 13, height: 1.35)),
                    Padding(
                      padding: const EdgeInsets.only(top: 3),
                      child: Row(spacing: 6, children: [
                        Text(kind.$2,
                            style: const TextStyle(
                                color: C.accent,
                                fontSize: 11.5,
                                fontWeight: FontWeight.w700)),
                        if (x.conversationId != null) ...[
                          const Text('·',
                              style: TextStyle(color: C.muted, fontSize: 11.5)),
                          const Text('Open chat',
                              style: TextStyle(
                                  color: C.muted,
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w600)),
                          const Icon(Icons.chevron_right,
                              size: 15, color: C.muted),
                        ],
                      ]),
                    ),
                  ]),
            ),
          ]),
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty();
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, spacing: 10, children: [
            Container(
              width: 72,
              height: 72,
              decoration: const BoxDecoration(
                  color: C.accentSoft, shape: BoxShape.circle),
              child: const Icon(Icons.notifications_none,
                  size: 34, color: C.accent),
            ),
            const SizedBox(height: 4),
            const Text('No notifications yet',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            const Text('Assignments and @mentions show up here.',
                textAlign: TextAlign.center,
                style: TextStyle(color: C.muted, height: 1.4)),
          ]),
        ),
      );
}
