// Port of apps/web/src/lib/quick-replies/match.ts. The shortcut shape must agree
// with migration 099's CHECK (^[a-z0-9_-]{1,32}$).

const shortcutMax = 32;
const bodyMax = 1024;

final _shortcutRe = RegExp(r'^[a-z0-9_-]{1,32}$');

class QuickReply {
  const QuickReply({
    required this.id,
    required this.shortcut,
    required this.body,
    required this.useCount,
  });
  final String id;
  final String shortcut;
  final String body;
  final int useCount;

  factory QuickReply.fromJson(Map<String, dynamic> j) => QuickReply(
        id: j['id'] as String,
        shortcut: j['shortcut'] as String,
        body: j['body'] as String,
        useCount: (j['use_count'] as num?)?.toInt() ?? 0,
      );
}

/// Whatever an agent typed, made into a legal shortcut.
String normaliseShortcut(String raw) {
  var s = raw.trim().toLowerCase().replaceFirst(RegExp(r'^/+'), '');
  s = s.replaceAll(RegExp(r'\s+'), '-').replaceAll(RegExp(r'[^a-z0-9_-]'), '');
  return s.length > shortcutMax ? s.substring(0, shortcutMax) : s;
}

bool isValidShortcut(String s) => _shortcutRe.hasMatch(s);

/// The query when the composer text is a request for the list: must START with
/// "/" and contain no whitespace. Otherwise null.
String? triggerQuery(String text) {
  if (!text.startsWith('/')) return null;
  final rest = text.substring(1);
  if (RegExp(r'\s').hasMatch(rest)) return null;
  return rest.toLowerCase();
}

List<QuickReply> filterQuickReplies(List<QuickReply> replies, String query,
    {int limit = 6}) {
  final q = query.toLowerCase();
  int byUse(QuickReply a, QuickReply b) {
    final c = b.useCount.compareTo(a.useCount);
    return c != 0 ? c : a.shortcut.compareTo(b.shortcut);
  }

  if (q.isEmpty) return ([...replies]..sort(byUse)).take(limit).toList();
  final prefix = <QuickReply>[];
  final rest = <QuickReply>[];
  for (final r in replies) {
    if (r.shortcut.startsWith(q)) {
      prefix.add(r);
    } else if (r.shortcut.contains(q) || r.body.toLowerCase().contains(q)) {
      rest.add(r);
    }
  }
  return [...(prefix..sort(byUse)), ...(rest..sort(byUse))].take(limit).toList();
}

/// Fill {{name}}, {{first_name}}, {{phone}}. Unlike automations, an unknown token
/// is LEFT IN PLACE: the agent reads and edits the box before sending.
String fillQuickReply(String body, {String? name, String? phone}) {
  final real = (name != null && name.trim().isNotEmpty) ? name.trim() : '';
  final values = {
    'name': real.isEmpty ? 'there' : real,
    'first_name': real.isEmpty ? 'there' : real.split(RegExp(r'\s+')).first,
    'phone': phone ?? '',
  };
  return body.replaceAllMapped(
    RegExp(r'\{\{\s*(name|first_name|phone)\s*\}\}', caseSensitive: false),
    (m) => values[m.group(1)!.toLowerCase()]!,
  );
}
