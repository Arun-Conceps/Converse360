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

  static String _greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    final convs = ref.watch(conversationsProvider).value ?? const [];
    final unread = convs.fold<int>(0, (a, c) => a + c.unreadCount);
    final alerts =
        ref.watch(notificationsProvider).value?.where((n) => n.unread).length ??
        0;
    final attention = convs.where((c) => c.unreadCount > 0).take(5).toList();
    final open = convs.where((c) => !c.isClosed).length;
    final mine = convs.where((c) => c.assignedAgentId == auth.userId).length;

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Home'),
            if (auth.workspace != null)
              Text(
                auth.workspace!.name,
                style: const TextStyle(
                  fontSize: 12,
                  color: C.muted,
                  fontWeight: FontWeight.w400,
                ),
              ),
          ],
        ),
        actions: [
          _Bell(count: alerts, onTap: () => context.push('/notifications')),
          const SizedBox(width: 12),
        ],
      ),
      body: MaxWidth(
        child: Column(
          children: [
            if (auth.workspace?.standing == 'grace')
              const BannerStrip(
                'Your last payment is late. The workspace still works.',
              ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () async =>
                    ref.refresh(conversationsProvider.future),
                // Bottom inset = the floating nav bar, which the page scrolls behind.
                child: ListView(
                  padding: EdgeInsets.fromLTRB(
                    16,
                    12,
                    16,
                    16 + MediaQuery.paddingOf(context).bottom,
                  ),
                  children: [
                    _Hero(
                      greeting: _greeting(),
                      unread: unread,
                      onOpen: () => context.go('/inbox'),
                    ),
                    const SectionLabel('Overview'),
                    IntrinsicHeight(
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        spacing: 10,
                        children: [
                          _Stat(
                            icon: Icons.mark_chat_unread_outlined,
                            value: unread,
                            label: 'Unread',
                            onTap: () => context.go('/inbox'),
                          ),
                          _Stat(
                            icon: Icons.forum_outlined,
                            value: open,
                            label: 'Open chats',
                            onTap: () => context.go('/inbox'),
                          ),
                          _Stat(
                            icon: Icons.assignment_ind_outlined,
                            value: mine,
                            label: 'Assigned\nto me',
                            onTap: () => context.go('/inbox'),
                          ),
                        ],
                      ),
                    ),
                    SectionLabel(
                      'Needs attention',
                      trailing: attention.isEmpty
                          ? null
                          : Text(
                              '${attention.length} chats',
                              style: const TextStyle(
                                color: C.accent,
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                    ),
                    attention.isEmpty
                        ? const _CaughtUp()
                        : Container(
                            decoration: cardDecoration(radius: 18),
                            clipBehavior: Clip.antiAlias,
                            child: Column(
                              children: [
                                for (var i = 0; i < attention.length; i++) ...[
                                  if (i > 0)
                                    const Divider(height: 1, indent: 72),
                                  _ChatRow(
                                    name: contactName(attention[i].contact),
                                    preview: attention[i].lastMessageText ?? '',
                                    count: attention[i].unreadCount,
                                    onTap: () => context.push(
                                      '/chat/${attention[i].id}',
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Bell in a soft green circle; the green count badge sits on its top-right.
class _Bell extends StatelessWidget {
  const _Bell({required this.count, required this.onTap});
  final int count;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: count > 0 ? 'Notifications, $count unread' : 'Notifications',
    child: InkWell(
      onTap: onTap,
      customBorder: const CircleBorder(),
      child: SizedBox(
        width: kHit,
        height: kHit,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Container(
              decoration: const BoxDecoration(
                color: C.accentSoft,
                shape: BoxShape.circle,
              ),
              child: Center(
                child: Icon(
                  count > 0
                      ? Icons.notifications_active
                      : Icons.notifications_none,
                  color: C.accent,
                  size: 23,
                ),
              ),
            ),
            if (count > 0)
              Positioned(
                top: -3,
                right: -3,
                child: Container(
                  constraints: const BoxConstraints(
                    minWidth: 20,
                    minHeight: 20,
                  ),
                  padding: const EdgeInsets.symmetric(horizontal: 5),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: C.accent,
                    borderRadius: BorderRadius.circular(99),
                    border: Border.all(color: Colors.white, width: 2),
                  ),
                  child: Text(
                    count > 99 ? '99+' : '$count',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 10.5,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    ),
  );
}

class _Hero extends StatelessWidget {
  const _Hero({
    required this.greeting,
    required this.unread,
    required this.onOpen,
  });
  final String greeting;
  final int unread;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
    decoration: BoxDecoration(
      gradient: kBrandGradient,
      borderRadius: BorderRadius.circular(20),
      boxShadow: [
        BoxShadow(
          color: C.accent.withValues(alpha: 0.25),
          blurRadius: 16,
          offset: const Offset(0, 6),
        ),
      ],
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      spacing: 4,
      children: [
        Text(
          '$greeting 👋',
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.85),
            fontSize: 13.5,
            fontWeight: FontWeight.w500,
          ),
        ),
        Text(
          unread == 0
              ? 'You\'re all caught up'
              : '$unread unread ${unread == 1 ? 'message' : 'messages'}',
          style: const TextStyle(
            color: Colors.white,
            fontSize: 22,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.3,
          ),
        ),
        Text(
          unread == 0
              ? 'No customer is waiting for a reply.'
              : 'Customers are waiting for a reply.',
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.85),
            fontSize: 12.5,
          ),
        ),
        const SizedBox(height: 10),
        Material(
          color: Colors.white,
          borderRadius: BorderRadius.circular(99),
          child: InkWell(
            borderRadius: BorderRadius.circular(99),
            onTap: onOpen,
            child: const Padding(
              padding: EdgeInsets.fromLTRB(14, 9, 10, 9),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                spacing: 4,
                children: [
                  Text(
                    'Open inbox',
                    style: TextStyle(
                      color: C.accent,
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                    ),
                  ),
                  Icon(Icons.arrow_forward, size: 16, color: C.accent),
                ],
              ),
            ),
          ),
        ),
      ],
    ),
  );
}

class _Stat extends StatelessWidget {
  const _Stat({
    required this.icon,
    required this.value,
    required this.label,
    required this.onTap,
  });
  final IconData icon;
  final int value;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Expanded(
    child: Material(
      color: C.surface,
      borderRadius: BorderRadius.circular(16),
      elevation: 0,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Ink(
          decoration: cardDecoration(),
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            spacing: 8,
            children: [
              IconTile(icon, size: 34),
              Text(
                '$value',
                style: const TextStyle(
                  fontSize: 24,
                  height: 1,
                  fontWeight: FontWeight.w800,
                ),
              ),
              // No fixed height: grows with the phone's font size.
              // IntrinsicHeight on the row keeps all three boxes equal.
              Flexible(
                child: Text(
                  label,
                  style: const TextStyle(
                    fontSize: 12,
                    height: 1.3,
                    color: C.muted,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class _ChatRow extends StatelessWidget {
  const _ChatRow({
    required this.name,
    required this.preview,
    required this.count,
    required this.onTap,
  });
  final String name;
  final String preview;
  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: C.surface,
    child: InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Row(
          spacing: 12,
          children: [
            AppAvatar(name, size: 44),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: 2,
                children: [
                  Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    preview,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: C.muted, fontSize: 13),
                  ),
                ],
              ),
            ),
            Container(
              constraints: const BoxConstraints(minWidth: 24, minHeight: 24),
              padding: const EdgeInsets.symmetric(horizontal: 7),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: C.accent,
                borderRadius: BorderRadius.circular(99),
              ),
              child: Text(
                '$count',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class _CaughtUp extends StatelessWidget {
  const _CaughtUp();
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 20),
    decoration: cardDecoration(radius: 18),
    child: const Column(
      spacing: 8,
      children: [
        CircleAvatar(
          radius: 28,
          backgroundColor: C.accentSoft,
          child: Icon(Icons.task_alt, color: C.accent, size: 28),
        ),
        SizedBox(height: 2),
        Text(
          'All caught up',
          style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700),
        ),
        Text(
          'Chats with unread messages will show up here.',
          textAlign: TextAlign.center,
          style: TextStyle(color: C.muted, fontSize: 12.5),
        ),
      ],
    ),
  );
}
