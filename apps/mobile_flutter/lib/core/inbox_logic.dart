import 'models.dart';

const windowDuration = Duration(hours: 24);

/// Endpoint per channel. Same body shape on all three (apps/web message-thread).
const sendPath = {
  Channel.whatsapp: '/whatsapp/send',
  Channel.instagram: '/instagram/send',
  Channel.web: '/web/send',
};

/// Is a free-text reply allowed right now? WhatsApp and Instagram count 24h from
/// the customer's last message; the web widget has no window. Closed means
/// "template only", so the composer disables rather than sending and failing.
bool isReplyWindowOpen(Conversation c, {DateTime? now}) {
  if (c.channel == Channel.web) return true;
  final last = c.lastInboundAt;
  if (last == null) return false;
  return (now ?? DateTime.now()).difference(last) < windowDuration;
}

String contactName(Contact? c) {
  if (c == null) return 'Unknown';
  final n = c.name?.trim();
  if (n != null && n.isNotEmpty) return n;
  if (c.phone != null && c.phone!.isNotEmpty) return c.phone!;
  if (c.igUsername != null && c.igUsername!.isNotEmpty) {
    return '@${c.igUsername}';
  }
  return 'Unknown';
}

String initials(String name) {
  final parts = name
      .replaceFirst(RegExp(r'^@'), '')
      .split(RegExp(r'\s+'))
      .where((p) => p.isNotEmpty)
      .toList();
  if (parts.isEmpty) return '?';
  final a = parts[0][0].toUpperCase();
  return parts.length > 1 ? a + parts[1][0].toUpperCase() : a;
}

enum InboxFilter { mine, unassigned, all, unread }

bool matchesFilter(Conversation c, InboxFilter f, String userId) => switch (f) {
      InboxFilter.mine => c.assignedAgentId == userId,
      InboxFilter.unassigned => c.assignedAgentId == null,
      InboxFilter.unread => c.unreadCount > 0,
      InboxFilter.all => true,
    };

String relativeTime(DateTime? t, {DateTime? now}) {
  if (t == null) return '';
  final s = (now ?? DateTime.now()).difference(t).inSeconds;
  if (s < 60) return 'now';
  if (s < 3600) return '${s ~/ 60}m';
  if (s < 86400) return '${s ~/ 3600}h';
  if (s < 604800) return '${s ~/ 86400}d';
  return '${t.day}/${t.month}';
}
