// Port of apps/web/src/lib/notes/mentions.ts. Keep behaviour identical: the text
// is the source of truth, and the ids are still UNTRUSTED (the database trigger
// in migration 100 re-checks workspace membership).

class Mentionable {
  const Mentionable(this.userId, this.name);
  final String userId;

  /// The text that follows "@"; unique across the list.
  final String name;
}

class MentionQuery {
  const MentionQuery(this.start, this.query);
  final int start;
  final String query;
}

class MentionSegment {
  const MentionSegment(this.text, {this.userId});
  final String text;
  final String? userId;
}

const _maxQuery = 30;

String _baseLabel(String? fullName, String? email) {
  final full = fullName?.trim();
  if (full != null && full.isNotEmpty) return full;
  final local = email?.split('@').first.trim();
  return (local != null && local.isNotEmpty) ? local : 'teammate';
}

/// Everyone who can be mentioned, with unique labels. Two people called "Priya"
/// would otherwise be one mention that notifies whichever came first.
List<Mentionable> buildMentionables(
    List<({String userId, String? fullName, String? email})> people) {
  final seen = <String, int>{};
  final out = <Mentionable>[];
  for (final p in people) {
    final base = _baseLabel(p.fullName, p.email);
    final key = base.toLowerCase();
    final count = seen[key] ?? 0;
    seen[key] = count + 1;
    var name = base;
    if (count > 0) {
      final local = p.email?.split('@').first.trim();
      name = '$base (${(local != null && local.isNotEmpty) ? local : count + 1})';
    }
    out.add(Mentionable(p.userId, name));
  }
  return out;
}

/// Is the caret inside an "@query"? The "@" must start the text or follow
/// whitespace, so an email address never opens the list.
MentionQuery? findMentionQuery(String text, int caret) {
  final c = caret.clamp(0, text.length);
  final before = text.substring(0, c);
  final at = before.lastIndexOf('@');
  if (at == -1) return null;
  if (at > 0 && !RegExp(r'\s').hasMatch(before[at - 1])) return null;
  final query = before.substring(at + 1);
  if (query.length > _maxQuery || query.contains('\n')) return null;
  return MentionQuery(at, query);
}

List<Mentionable> filterMentionables(List<Mentionable> list, String query,
    {int limit = 5}) {
  final q = query.trim().toLowerCase();
  if (q.isEmpty) return list.take(limit).toList();
  final starts = <Mentionable>[];
  final contains = <Mentionable>[];
  for (final m in list) {
    final n = m.name.toLowerCase();
    if (n.startsWith(q) || n.split(RegExp(r'\s+')).any((w) => w.startsWith(q))) {
      starts.add(m);
    } else if (n.contains(q)) {
      contains.add(m);
    }
  }
  return [...starts, ...contains].take(limit).toList();
}

({String text, int caret}) applyMention(
    String text, int start, int caret, String name) {
  final insert = '@$name ';
  return (
    text: text.substring(0, start) + insert + text.substring(caret),
    caret: start + insert.length,
  );
}

/// Longest names first, so "@Asha Rao" is never claimed by a shorter "@Asha".
/// The lookahead stops "@Ash" matching inside "@Ashley".
RegExp? _mentionRegex(List<Mentionable> list) {
  if (list.isEmpty) return null;
  final names = (list.map((m) => m.name).toList()
        ..sort((a, b) => b.length.compareTo(a.length)))
      .map(RegExp.escape);
  return RegExp('@(${names.join('|')})(?![\\p{L}\\p{N}_])',
      caseSensitive: false, unicode: true);
}

/// The teammates the final text actually mentions, each once.
List<String> extractMentionedIds(String text, List<Mentionable> list) {
  final re = _mentionRegex(list);
  if (re == null) return const [];
  final byName = {for (final m in list) m.name.toLowerCase(): m.userId};
  final ids = <String>{};
  for (final m in re.allMatches(text)) {
    final id = byName[m.group(1)!.toLowerCase()];
    if (id != null) ids.add(id);
  }
  return ids.toList();
}

/// Split note text into plain and mention segments, for highlighting.
List<MentionSegment> splitMentions(String text, List<Mentionable> list) {
  final re = _mentionRegex(list);
  if (re == null) return [MentionSegment(text)];
  final byName = {for (final m in list) m.name.toLowerCase(): m.userId};
  final out = <MentionSegment>[];
  var last = 0;
  for (final m in re.allMatches(text)) {
    if (m.start > last) out.add(MentionSegment(text.substring(last, m.start)));
    out.add(MentionSegment(m.group(0)!, userId: byName[m.group(1)!.toLowerCase()]));
    last = m.end;
  }
  if (last < text.length) out.add(MentionSegment(text.substring(last)));
  return out.isEmpty ? [MentionSegment(text)] : out;
}
