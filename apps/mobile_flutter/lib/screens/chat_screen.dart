import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/inbox_logic.dart';
import '../core/media_send.dart';
import '../core/mentions.dart';
import '../core/models.dart';
import '../core/models_more.dart';
import '../core/quick_replies.dart';
import '../core/theme.dart';
import '../state/auth.dart';
import '../state/data.dart';
import '../state/data_more.dart';
import '../ui/widgets.dart';

const _noteBg = Color(0xFFFBEFC9);
const _noteFg = Color(0xFF6B4A00);

String _preview(Message m) {
  if (m.contentText != null && m.contentText!.isNotEmpty) return m.contentText!;
  if (m.contentType == 'template') return 'Template: ${m.templateName ?? ''}';
  return '[${m.contentType}]';
}

String _tick(Message m) {
  if (m.fromCustomer) return '';
  return switch (m.status) {
    'read' => '✓✓ read',
    'delivered' => '✓✓',
    'failed' => '! failed',
    'sending' => '…',
    _ => '✓',
  };
}

enum _Mode { reply, note }

class _Item {
  _Item.message(Message this.message)
      : note = null,
        at = message.createdAt;
  _Item.note(ContactNote this.note)
      : message = null,
        at = note.createdAt;
  final Message? message;
  final ContactNote? note;
  final DateTime at;
}

class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key, required this.conversationId});
  final String conversationId;
  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _text = TextEditingController();
  _Mode _mode = _Mode.reply;
  bool _busy = false;
  bool _marking = false;
  String? _error;

  String get _id => widget.conversationId;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  void _toast(String m) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(m)));

  // Opening a thread reads it. Guarded by `_marking` and unreadCount > 0, so it
  // cannot loop: once the count is 0 no further UPDATE is issued.
  void _markReadIfNeeded(Conversation? c) {
    final accountId = ref.read(accountIdProvider);
    if (c == null || accountId == null || c.unreadCount == 0 || _marking) return;
    _marking = true;
    scheduleMicrotask(() async {
      try {
        await markConversationRead(accountId, _id);
        ref.invalidate(conversationsProvider);
      } finally {
        _marking = false;
      }
    });
  }

  Future<void> _submit(Conversation c, List<Mentionable> mentionables) async {
    final body = _text.text.trim();
    if (body.isEmpty) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (_mode == _Mode.note) {
        final contactId = c.contact?.id;
        final accountId = ref.read(accountIdProvider);
        final userId = ref.read(authProvider).userId;
        if (contactId == null || accountId == null || userId == null) {
          throw 'This conversation has no contact to attach a note to.';
        }
        await addNote(
          accountId: accountId,
          contactId: contactId,
          userId: userId,
          text: body,
          mentionedUserIds: extractMentionedIds(body, mentionables),
          conversationId: _id,
        );
        ref.invalidate(contactNotesProvider(contactId));
      } else {
        await ref.read(apiProvider).request('POST', sendPath[c.channel]!, body: {
          'conversation_id': _id,
          'message_type': 'text',
          'content_text': body,
        });
        ref.invalidate(messagesProvider(_id));
      }
      _text.clear();
    } catch (e) {
      if (mounted) setState(() => _error = '$e Tap send to retry.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Pick -> upload to chat-media -> send. The text box, if filled, becomes the
  /// caption (documents and images only; Meta rejects it on audio).
  Future<void> _attach(Conversation c, MediaSource source) async {
    final accountId = ref.read(accountIdProvider);
    if (accountId == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final media = await pickAndUploadMedia(source, accountId);
      if (media == null) return;
      final caption = _text.text.trim();
      await ref.read(apiProvider).request('POST', sendPath[c.channel]!, body: {
        'conversation_id': _id,
        'message_type': media.kind,
        'media_url': media.url,
        if (media.kind == 'document') 'filename': media.fileName,
        if (caption.isNotEmpty &&
            (media.kind == 'image' || media.kind == 'document'))
          'content_text': caption,
      });
      ref.invalidate(messagesProvider(_id));
      _text.clear();
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _attachSheet(Conversation c) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          for (final o in const [
            (Icons.photo_library_outlined, 'Photo from gallery', MediaSource.gallery),
            (Icons.photo_camera_outlined, 'Take a photo', MediaSource.camera),
            (Icons.insert_drive_file_outlined, 'Document', MediaSource.document),
          ])
            ListTile(
              leading: Icon(o.$1, color: C.accent),
              title: Text(o.$2),
              onTap: () {
                Navigator.pop(ctx);
                _attach(c, o.$3);
              },
            ),
        ]),
      ),
    );
  }

  Future<void> _setStatus(String status) async {
    final accountId = ref.read(accountIdProvider);
    if (accountId == null) return;
    try {
      await setConversationStatus(accountId, _id, status);
      ref.invalidate(conversationProvider(_id));
      ref.invalidate(conversationsProvider);
      _toast(status == 'closed' ? 'Marked resolved' : 'Reopened');
    } catch (e) {
      _toast('Could not change the status');
    }
  }

  Future<void> _assign(String? userId) async {
    final accountId = ref.read(accountIdProvider);
    if (accountId == null) return;
    try {
      await assignConversation(accountId, _id, userId);
      ref.invalidate(conversationProvider(_id));
      ref.invalidate(conversationsProvider);
      _toast(userId == null ? 'Unassigned' : 'Assigned');
    } catch (e) {
      _toast('Could not assign');
    }
  }

  Future<void> _pickAssignee() async {
    final members = await ref.read(membersProvider.future);
    if (!mounted) return;
    final chosen = await showModalBottomSheet<String>(
      context: context,
      builder: (_) => SafeArea(
        child: ListView(shrinkWrap: true, children: [
          const Padding(
              padding: EdgeInsets.all(16),
              child: Text('Assign to',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700))),
          for (final m in members)
            ListTile(
              leading: AppAvatar(m.fullName ?? m.email ?? '?', size: 34),
              title: Text(m.fullName ?? m.email ?? 'Teammate'),
              onTap: () => Navigator.pop(context, m.userId),
            ),
        ]),
      ),
    );
    if (chosen != null) await _assign(chosen);
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    final conv = ref.watch(conversationProvider(_id));
    final msgs = ref.watch(messagesProvider(_id));
    final members = ref.watch(membersProvider).value ?? const <TeamMember>[];
    final replies = ref.watch(quickRepliesProvider).value ?? const <QuickReply>[];
    final c = conv.value;
    final contactId = c?.contact?.id;
    final notes = (contactId == null
            ? null
            : ref.watch(contactNotesProvider(contactId)).value) ??
        const <ContactNote>[];
    _markReadIfNeeded(c);

    final mentionables = buildMentionables([
      for (final m in members) (userId: m.userId, fullName: m.fullName, email: m.email)
    ]);
    final nameOf = {for (final m in members) m.userId: m.fullName ?? m.email ?? 'Teammate'};

    // Viewers read; agents and above write (same line the composer draws on web).
    final canWrite = auth.workspace?.role != 'viewer';
    final name = contactName(c?.contact);
    final windowOpen = c != null && isReplyWindowOpen(c);
    // A note sends nothing, so the 24-hour window does not gate it.
    final inputEnabled = canWrite && (_mode == _Mode.note || windowOpen);

    final items = <_Item>[
      for (final m in msgs.value ?? const <Message>[]) _Item.message(m),
      for (final n in notes) _Item.note(n),
    ]..sort((a, b) => b.at.compareTo(a.at)); // newest first

    // Suggestions above the composer.
    final slash = _mode == _Mode.reply ? triggerQuery(_text.text) : null;
    final quick = slash == null ? const <QuickReply>[] : filterQuickReplies(replies, slash);
    final caret = _text.selection.baseOffset;
    final mq = _mode == _Mode.note && caret >= 0 ? findMentionQuery(_text.text, caret) : null;
    final mentionOptions =
        mq == null ? const <Mentionable>[] : filterMentionables(mentionables, mq.query);

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
            tooltip: 'Back',
            icon: const Icon(Icons.chevron_left, size: 28),
            onPressed: () => context.canPop() ? context.pop() : context.go('/inbox')),
        titleSpacing: 0,
        title: Row(spacing: 10, children: [
          AppAvatar(name, size: 34),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              Text(
                  c == null
                      ? ''
                      : (c.assignedAgentId == null
                          ? 'Unassigned'
                          : 'Assigned: ${nameOf[c.assignedAgentId] ?? 'teammate'}'),
                  style: const TextStyle(
                      fontSize: 12, color: C.muted, fontWeight: FontWeight.w400)),
            ]),
          ),
        ]),
        actions: [
          Pill(c?.isClosed == true ? 'Closed' : 'Open',
              tone: c?.isClosed == true ? PillTone.plain : PillTone.ok),
          if (canWrite && c != null)
            PopupMenuButton<String>(
              tooltip: 'Chat options',
              onSelected: (v) {
                switch (v) {
                  case 'status':
                    _setStatus(c.isClosed ? 'open' : 'closed');
                  case 'me':
                    _assign(auth.userId);
                  case 'pick':
                    _pickAssignee();
                  case 'none':
                    _assign(null);
                }
              },
              itemBuilder: (_) => [
                PopupMenuItem(value: 'status', child: Text(c.isClosed ? 'Reopen' : 'Mark resolved')),
                const PopupMenuItem(value: 'me', child: Text('Assign to me')),
                const PopupMenuItem(value: 'pick', child: Text('Assign to…')),
                const PopupMenuItem(value: 'none', child: Text('Unassign')),
              ],
            ),
        ],
      ),
      body: Column(children: [
        if (c != null && !windowOpen)
          const BannerStrip(
              'The 24-hour window is closed. Only an approved template can be sent. You can still leave a note.'),
        Expanded(
          child: msgs.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => EmptyState('Could not load messages', hint: '$e'),
            data: (_) => items.isEmpty
                ? const EmptyState('No messages yet')
                : ListView.separated(
                    reverse: true,
                    padding: const EdgeInsets.all(12),
                    itemCount: items.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 6),
                    itemBuilder: (_, i) {
                      final it = items[i];
                      return it.note != null
                          ? _NoteBubble(
                              note: it.note!,
                              author: nameOf[it.note!.userId] ?? 'Teammate',
                              mentionables: mentionables)
                          : _Bubble(it.message!);
                    },
                  ),
          ),
        ),
        if (quick.isNotEmpty)
          _Suggestions(children: [
            for (final r in quick)
              ListTile(
                dense: true,
                title: Text('/${r.shortcut}', style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text(r.body, maxLines: 1, overflow: TextOverflow.ellipsis),
                onTap: () {
                  // Dropped into the box, editable, before anything is sent.
                  final filled =
                      fillQuickReply(r.body, name: c?.contact?.name, phone: c?.contact?.phone);
                  _text.value = TextEditingValue(
                      text: filled, selection: TextSelection.collapsed(offset: filled.length));
                  final accountId = ref.read(accountIdProvider);
                  if (accountId != null) {
                    bumpQuickReplyUse(accountId, r)
                        .then((_) => ref.invalidate(quickRepliesProvider));
                  }
                  setState(() {});
                },
              ),
          ]),
        if (mentionOptions.isNotEmpty)
          _Suggestions(children: [
            for (final m in mentionOptions)
              ListTile(
                dense: true,
                leading: AppAvatar(m.name, size: 28),
                title: Text(m.name),
                onTap: () {
                  final r = applyMention(_text.text, mq!.start, caret, m.name);
                  _text.value = TextEditingValue(
                      text: r.text, selection: TextSelection.collapsed(offset: r.caret));
                  setState(() {});
                },
              ),
          ]),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 6, 14, 0),
            child: Align(
                alignment: Alignment.centerLeft,
                child: Text(_error!, style: const TextStyle(color: C.bad))),
          ),
        if (!canWrite)
          const BannerStrip('You have read-only access in this workspace.')
        else
          SafeArea(
            top: false,
            child: Container(
              color: C.surface,
              padding: const EdgeInsets.fromLTRB(10, 6, 10, 10),
              child: Column(children: [
                Row(spacing: 4, children: [
                  for (final m in _Mode.values)
                    ChoiceChip(
                      label: Text(m == _Mode.reply ? 'Reply' : 'Internal note'),
                      selected: _mode == m,
                      showCheckmark: false,
                      selectedColor: m == _Mode.note ? _noteBg : C.accentSoft,
                      labelStyle: TextStyle(
                          fontSize: 12,
                          color: _mode == m ? (m == _Mode.note ? _noteFg : C.accent) : C.muted),
                      shape: const StadiumBorder(side: BorderSide(color: Colors.transparent)),
                      onSelected: (_) => setState(() => _mode = m),
                    ),
                ]),
                Row(spacing: 6, crossAxisAlignment: CrossAxisAlignment.end, children: [
                  if (_mode == _Mode.reply)
                    IconButton(
                      tooltip: 'Attach',
                      onPressed: !inputEnabled || _busy || c == null
                          ? null
                          : () => _attachSheet(c),
                      icon: const Icon(Icons.attach_file, color: C.muted),
                    ),
                  Expanded(
                    child: TextField(
                      controller: _text,
                      enabled: inputEnabled,
                      minLines: 1,
                      maxLines: 5,
                      onChanged: (_) => setState(() {}),
                      decoration: InputDecoration(
                        hintText: _mode == _Mode.note
                            ? 'Write a note, @mention a teammate'
                            : (windowOpen
                                ? 'Message, or / for quick replies'
                                : 'Window closed: template only'),
                        filled: true,
                        fillColor: _mode == _Mode.note
                            ? _noteBg
                            : (inputEnabled ? C.surface : C.surface2),
                        contentPadding:
                            const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(22),
                            borderSide: const BorderSide(color: C.line)),
                        enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(22),
                            borderSide: const BorderSide(color: C.line)),
                      ),
                    ),
                  ),
                  IconButton.filled(
                    tooltip: _mode == _Mode.note ? 'Save note' : 'Send',
                    style: IconButton.styleFrom(
                        backgroundColor: C.accent, minimumSize: const Size(kHit, kHit)),
                    onPressed: !inputEnabled || _busy || _text.text.trim().isEmpty || c == null
                        ? null
                        : () => _submit(c, mentionables),
                    icon: _busy
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : Icon(_mode == _Mode.note ? Icons.sticky_note_2_outlined : Icons.send,
                            size: 18),
                  ),
                ]),
              ]),
            ),
          ),
      ]),
    );
  }
}

class _Suggestions extends StatelessWidget {
  const _Suggestions({required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => Container(
        decoration: const BoxDecoration(
            color: C.surface, border: Border(top: BorderSide(color: C.line))),
        child: Column(mainAxisSize: MainAxisSize.min, children: children),
      );
}

class _Bubble extends StatelessWidget {
  const _Bubble(this.m);
  final Message m;
  @override
  Widget build(BuildContext context) {
    final mine = !m.fromCustomer;
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.8),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 7, horizontal: 10),
          decoration: BoxDecoration(
            color: mine ? C.out : C.surface,
            borderRadius: BorderRadius.circular(12),
            border: mine ? null : Border.all(color: C.line),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            if (m.mediaUrl != null && m.mediaUrl!.startsWith('https://')) ...[
              if (m.contentType == 'image')
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.network(m.mediaUrl!,
                        width: 220,
                        fit: BoxFit.cover,
                        errorBuilder: (_, _, _) => const Text('Image unavailable',
                            style: TextStyle(color: C.muted))),
                  ),
                )
              else
                InkWell(
                  onTap: () => launchUrl(Uri.parse(m.mediaUrl!),
                      mode: LaunchMode.externalApplication),
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Row(mainAxisSize: MainAxisSize.min, spacing: 6, children: [
                      const Icon(Icons.attach_file, size: 16, color: C.accent),
                      Text('Open ${m.contentType}',
                          style: const TextStyle(
                              color: C.accent, decoration: TextDecoration.underline)),
                    ]),
                  ),
                ),
            ],
            Align(alignment: Alignment.centerLeft, child: Text(_preview(m))),
            Text(
              '${m.senderType == 'bot' ? 'AI agent · ' : ''}${DateFormat.jm().format(m.createdAt.toLocal())} ${_tick(m)}',
              style: TextStyle(fontSize: 10.5, color: m.status == 'failed' ? C.bad : C.muted),
            ),
          ]),
        ),
      ),
    );
  }
}

class _NoteBubble extends StatelessWidget {
  const _NoteBubble({required this.note, required this.author, required this.mentionables});
  final ContactNote note;
  final String author;
  final List<Mentionable> mentionables;
  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: _noteBg, borderRadius: BorderRadius.circular(12)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text.rich(TextSpan(
            style: const TextStyle(color: _noteFg),
            children: [
              const TextSpan(text: '📝 '),
              for (final s in splitMentions(note.text, mentionables))
                TextSpan(
                    text: s.text,
                    style: s.userId != null ? const TextStyle(fontWeight: FontWeight.w700) : null),
            ],
          )),
          const SizedBox(height: 2),
          Text(
              '$author · Internal note, only your team sees this · ${DateFormat.jm().format(note.createdAt.toLocal())}',
              style: const TextStyle(fontSize: 10.5, color: _noteFg)),
        ]),
      );
}
