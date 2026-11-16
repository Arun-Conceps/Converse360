import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/quick_replies.dart';
import '../core/theme.dart';
import '../state/auth.dart';
import '../state/data_more.dart';
import '../ui/widgets.dart';

class QuickRepliesScreen extends ConsumerWidget {
  const QuickRepliesScreen({super.key});

  Future<void> _add(BuildContext context, WidgetRef ref) async {
    final accountId = ref.read(accountIdProvider);
    final userId = ref.read(authProvider).userId;
    if (accountId == null || userId == null) return;
    final short = TextEditingController();
    final body = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('New quick reply'),
        content: Column(mainAxisSize: MainAxisSize.min, spacing: 10, children: [
          TextField(
              controller: short,
              decoration: const InputDecoration(labelText: 'Shortcut', prefixText: '/')),
          TextField(
              controller: body,
              minLines: 3,
              maxLines: 6,
              maxLength: bodyMax,
              decoration: const InputDecoration(
                  labelText: 'Message', helperText: 'Use {{name}}, {{first_name}}, {{phone}}')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
        ],
      ),
    );
    if (ok != true) return;
    final shortcut = normaliseShortcut(short.text);
    if (!isValidShortcut(shortcut) || body.text.trim().isEmpty) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Add a shortcut and a message')));
      }
      return;
    }
    try {
      await addQuickReply(accountId, userId, shortcut, body.text.trim());
      ref.invalidate(quickRepliesProvider);
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text('Could not save. "/$shortcut" may already exist.')));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(quickRepliesProvider);
    final role = ref.watch(authProvider).workspace?.role;
    final canWrite = role != 'viewer';
    final accountId = ref.watch(accountIdProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Quick replies'),
        leading: IconButton(
            icon: const Icon(Icons.chevron_left, size: 28),
            onPressed: () => context.pop()),
        actions: [
          if (canWrite)
            IconButton(
                tooltip: 'Add',
                onPressed: () => _add(context, ref),
                icon: const Icon(Icons.add)),
        ],
      ),
      body: list.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => EmptyState('Could not load quick replies', hint: '$e'),
        data: (rows) => rows.isEmpty
            ? const EmptyState('No quick replies',
                hint: 'Type / in a chat to use them once you add some.')
            : ListView.builder(
                itemCount: rows.length,
                itemBuilder: (_, i) {
                  final r = rows[i];
                  return ListTile(
                    tileColor: C.surface,
                    title: Text('/${r.shortcut}',
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text(r.body, maxLines: 2, overflow: TextOverflow.ellipsis),
                    trailing: canWrite && accountId != null
                        ? IconButton(
                            tooltip: 'Delete /${r.shortcut}',
                            icon: const Icon(Icons.delete_outline, color: C.bad),
                            onPressed: () async {
                              await deleteQuickReply(accountId, r.id);
                              ref.invalidate(quickRepliesProvider);
                            })
                        : null,
                  );
                },
              ),
      ),
    );
  }
}
