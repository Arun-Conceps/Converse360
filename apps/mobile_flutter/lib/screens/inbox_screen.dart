import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/inbox_logic.dart';
import '../core/models.dart';
import '../core/theme.dart';
import '../state/auth.dart';
import '../state/data.dart';
import '../ui/widgets.dart';

const _channelLabel = {
  Channel.whatsapp: 'WhatsApp',
  Channel.instagram: 'Instagram',
  Channel.web: 'Web chat',
};
const _filterLabel = {
  InboxFilter.mine: 'Mine',
  InboxFilter.unassigned: 'Unassigned',
  InboxFilter.all: 'All',
  InboxFilter.unread: 'Unread',
};

class InboxScreen extends ConsumerStatefulWidget {
  const InboxScreen({super.key});
  @override
  ConsumerState<InboxScreen> createState() => _InboxScreenState();
}

class _InboxScreenState extends ConsumerState<InboxScreen> {
  InboxFilter _filter = InboxFilter.all;
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    final convs = ref.watch(conversationsProvider);

    return Scaffold(
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Inbox'),
          if (auth.workspace != null)
            Text(auth.workspace!.name,
                style: const TextStyle(
                    fontSize: 12, color: C.muted, fontWeight: FontWeight.w400)),
        ]),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(0),
          child: Container(height: 1, color: C.line),
        ),
      ),
      body: Column(children: [
        SearchField(
            hint: 'Search chats', onChanged: (v) => setState(() => _q = v)),
        Container(
          color: C.surface,
          padding: const EdgeInsets.fromLTRB(14, 0, 14, 8),
          child: Row(spacing: 6, children: [
            for (final f in InboxFilter.values)
              ChoiceChip(
                label: Text(_filterLabel[f]!),
                selected: _filter == f,
                onSelected: (_) => setState(() => _filter = f),
                selectedColor: C.accent,
                labelStyle: TextStyle(
                    fontSize: 12.5,
                    color: _filter == f ? Colors.white : C.muted),
                showCheckmark: false,
                shape: const StadiumBorder(side: BorderSide(color: C.line)),
              ),
          ]),
        ),
        const Divider(),
        Expanded(
          child: convs.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => EmptyState('Could not load chats', hint: '$e'),
            data: (all) {
              final needle = _q.trim().toLowerCase();
              final rows = all
                  .where((c) =>
                      matchesFilter(c, _filter, auth.userId ?? '') &&
                      (needle.isEmpty ||
                          '${contactName(c.contact)} ${c.lastMessageText ?? ''}'
                              .toLowerCase()
                              .contains(needle)))
                  .toList();
              return RefreshIndicator(
                onRefresh: () async => ref.refresh(conversationsProvider.future),
                child: rows.isEmpty
                    ? ListView(children: const [
                        SizedBox(height: 80),
                        EmptyState('No chats here', hint: 'Try another filter.')
                      ])
                    : ListView.builder(
                        itemCount: rows.length,
                        itemBuilder: (_, i) => _ConversationTile(rows[i]),
                      ),
              );
            },
          ),
        ),
      ]),
    );
  }
}

class _ConversationTile extends StatelessWidget {
  const _ConversationTile(this.c);
  final Conversation c;

  @override
  Widget build(BuildContext context) {
    final name = contactName(c.contact);
    return InkWell(
      onTap: () => context.push('/chat/${c.id}'),
      child: Container(
        constraints: const BoxConstraints(minHeight: kHit),
        padding: const EdgeInsets.all(12),
        decoration: const BoxDecoration(
            color: C.surface, border: Border(bottom: BorderSide(color: C.line))),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, spacing: 10, children: [
          AppAvatar(name),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, spacing: 2, children: [
              Row(children: [
                Expanded(
                    child: Text(name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w600))),
                Text(relativeTime(c.lastMessageAt),
                    style: const TextStyle(fontSize: 11.5, color: C.muted)),
              ]),
              Row(spacing: 8, children: [
                Expanded(
                    child: Text(c.lastMessageText ?? 'No messages yet',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: C.muted, fontSize: 12.5))),
                if (c.unreadCount > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                    decoration: BoxDecoration(
                        color: C.accent, borderRadius: BorderRadius.circular(10)),
                    child: Text('${c.unreadCount}',
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 11,
                            fontWeight: FontWeight.w600)),
                  ),
              ]),
              const SizedBox(height: 2),
              Wrap(spacing: 4, children: [
                Pill(_channelLabel[c.channel]!),
                if (!isReplyWindowOpen(c)) const Pill('Window closed', tone: PillTone.warn),
                if (c.isClosed) const Pill('Closed'),
              ]),
            ]),
          ),
        ]),
      ),
    );
  }
}
