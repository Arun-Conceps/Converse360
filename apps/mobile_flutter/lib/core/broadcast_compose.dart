/// Pure rules for composing a broadcast on the phone (no Flutter, no network),
/// so they can be unit-tested.
library;

/// A template the phone is allowed to send.
///
/// The phone covers the common case: body text with `{{1}}`-style variables.
/// Anything that needs per-send media, a location pin, or a button parameter
/// is left to the web editor, because a half-filled one is a rejected send.
class ComposeTemplate {
  const ComposeTemplate({
    required this.name,
    required this.language,
    required this.body,
    this.headerType,
    this.headerContent,
    this.buttons,
  });

  final String name;
  final String language;
  final String body;
  final String? headerType;
  final String? headerContent;
  final dynamic buttons;

  factory ComposeTemplate.fromJson(Map<String, dynamic> j) => ComposeTemplate(
    name: j['name'] as String,
    language: (j['language'] as String?) ?? 'en_US',
    body: (j['body_text'] as String?) ?? '',
    headerType: j['header_type'] as String?,
    headerContent: j['header_content'] as String?,
    buttons: j['buttons'],
  );

  /// Why the phone cannot send this template, or null when it can.
  String? get unsupportedReason {
    final h = (headerType ?? '').toUpperCase();
    if (h == 'IMAGE' || h == 'VIDEO' || h == 'DOCUMENT') {
      return 'Needs a header file — send it from the web';
    }
    if (h == 'LOCATION') return 'Needs a location pin — send it from the web';
    if (h == 'TEXT' && (headerContent ?? '').contains('{{')) {
      return 'Has a header variable — send it from the web';
    }
    final b = buttons;
    if (b is List) {
      for (final x in b) {
        if (x is Map && '${x['url'] ?? ''}'.contains('{{')) {
          return 'Has a button variable — send it from the web';
        }
      }
    }
    return null;
  }
}

final _varRe = RegExp(r'\{\{\s*(\d+)\s*\}\}');

/// Distinct placeholder numbers in the body, in numeric order ("2" before
/// "10", which a plain string sort gets wrong).
List<String> templateVariableKeys(String body) {
  final seen = <int>{};
  for (final m in _varRe.allMatches(body)) {
    seen.add(int.parse(m.group(1)!));
  }
  final sorted = seen.toList()..sort();
  return [for (final n in sorted) '$n'];
}

/// How one placeholder is filled for every recipient.
sealed class VarFill {
  const VarFill();
  Map<String, String> toJson();
}

/// The same text for everyone.
class StaticFill extends VarFill {
  const StaticFill(this.value);
  final String value;
  @override
  Map<String, String> toJson() => {'type': 'static', 'value': value};
}

/// A field of each contact: name | phone | email | company.
class FieldFill extends VarFill {
  const FieldFill(this.field);
  final String field;
  @override
  Map<String, String> toJson() => {'type': 'field', 'value': field};
}

enum AudienceKind { all, tags, segments }

class AudiencePick {
  const AudiencePick(this.kind, {this.ids = const []});
  final AudienceKind kind;
  final List<String> ids;

  /// False while the pick cannot mean anything (tags chosen, none selected).
  bool get isComplete => kind == AudienceKind.all || ids.isNotEmpty;

  Map<String, dynamic> toJson() => switch (kind) {
    AudienceKind.all => {'type': 'all'},
    AudienceKind.tags => {'type': 'tags', 'tagIds': ids},
    AudienceKind.segments => {'type': 'segments', 'segmentIds': ids},
  };
}

/// True when every placeholder has a non-empty fill.
bool variablesComplete(List<String> keys, Map<String, VarFill> fills) {
  for (final k in keys) {
    final f = fills[k];
    if (f == null) return false;
    if (f is StaticFill && f.value.trim().isEmpty) return false;
  }
  return true;
}

/// The API refuses anything under a minute away or past 90 days; saying so
/// on the phone first is kinder than a round trip to a 400.
const minScheduleLead = Duration(minutes: 1);
const maxScheduleAhead = Duration(days: 90);

/// Why [at] cannot be used as a send time, or null when it can.
String? scheduleError(DateTime at, DateTime now) {
  final lead = at.difference(now);
  if (lead < minScheduleLead) return 'Pick a time at least a minute from now.';
  if (lead > maxScheduleAhead) {
    return 'Broadcasts can be scheduled up to 90 days ahead.';
  }
  return null;
}

/// The request body for `POST /whatsapp/broadcasts`. [scheduledAt] null =
/// send now; otherwise it is sent as an absolute (UTC) instant, so the
/// phone's time zone cannot change when it goes out.
Map<String, dynamic> buildBroadcastBody({
  required String name,
  required ComposeTemplate template,
  required AudiencePick audience,
  required Map<String, VarFill> fills,
  DateTime? scheduledAt,
}) {
  final keys = templateVariableKeys(template.body);
  return {
    'name': name.trim(),
    'template_name': template.name,
    'template_language': template.language,
    'audience': audience.toJson(),
    'variables': {for (final k in keys) k: fills[k]!.toJson()},
    if (scheduledAt != null) 'scheduled_at': scheduledAt.toUtc().toIso8601String(),
  };
}

/// The template body with each placeholder replaced by a readable stand-in,
/// for the review step.
String previewBody(String body, Map<String, VarFill> fills) {
  return body.replaceAllMapped(_varRe, (m) {
    final f = fills[m.group(1)!];
    return switch (f) {
      StaticFill(:final value) when value.trim().isNotEmpty => value,
      FieldFill(:final field) => '[$field]',
      _ => m.group(0)!,
    };
  });
}
