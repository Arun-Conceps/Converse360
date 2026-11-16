import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../core/inbox_logic.dart';
import '../core/theme.dart';
import '../state/contact_detail.dart';
import '../state/data_more.dart';
import '../ui/widgets.dart';

const _noteBg = Color(0xFFFBEFC9);
const _noteFg = Color(0xFF6B4A00);

class ContactScreen extends ConsumerWidget {
  const ContactScreen({super.key, required this.contactId});
  final String contactId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final d = ref.watch(contactDetailProvider(contactId));
    final notes = ref.watch(contactNotesProvider(contactId)).value ?? const [];
    final members = ref.watch(membersProvider).value ?? const [];
    final nameOf = {
      for (final m in members) m.userId: m.fullName ?? m.email ?? 'Teammate'
    };
    return Scaffold(
      appBar: AppBar(
        title: const Text('Contact'),
        leading: IconButton(
            icon: const Icon(Icons.chevron_left, size: 28),
            onPressed: () => context.pop()),
      ),
      body: d.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => EmptyState('Could not load contact', hint: '$e'),
        data: (x) {
          final c = x.contact;
          final name = contactName(c);
          return ListView(padding: const EdgeInsets.all(14), children: [
            Row(children: [
              AppAvatar(name, size: 56),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(name,
                      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
                  if (c.phone != null)
                    Text(c.phone!, style: const TextStyle(color: C.muted)),
                  if (c.company != null && c.company!.isNotEmpty)
                    Text(c.company!, style: const TextStyle(color: C.muted)),
                ]),
              ),
            ]),
            const SizedBox(height: 14),
            AppButton(x.conversationId == null ? 'No conversation yet' : 'Open chat',
                primary: true,
                onPressed: x.conversationId == null
                    ? null
                    : () => context.push('/chat/${x.conversationId}')),
            const SizedBox(height: 18),
            const Text('NOTES',
                style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.8,
                    color: C.muted)),
            const SizedBox(height: 6),
            if (notes.isEmpty)
              const Text('No notes yet. Add one from the chat.',
                  style: TextStyle(color: C.muted))
            else
              for (final n in notes.reversed)
                Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                      color: _noteBg, borderRadius: BorderRadius.circular(12)),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(n.text, style: const TextStyle(color: _noteFg)),
                    Text(
                        '${nameOf[n.userId] ?? 'Teammate'} · ${DateFormat.MMMd().add_jm().format(n.createdAt.toLocal())}',
                        style: const TextStyle(fontSize: 10.5, color: _noteFg)),
                  ]),
                ),
          ]);
        },
      ),
    );
  }
}
