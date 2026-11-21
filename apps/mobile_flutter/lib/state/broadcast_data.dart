import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/broadcast_compose.dart';
import 'auth.dart';
import 'data.dart';

// Reads for the New broadcast screen. Same rule as the rest of the app: every
// account-scoped query names the active workspace itself (RLS only scopes to
// MEMBERSHIPS).

/// Approved templates, with the columns that decide whether the phone can send
/// them. Unsupported ones are still returned so the picker can say WHY they
/// are greyed out instead of silently hiding them.
final composeTemplatesProvider =
    FutureProvider.autoDispose<List<ComposeTemplate>>((ref) async {
      final accountId = ref.watch(accountIdProvider);
      if (accountId == null) return const [];
      final rows = await sb
          .from('message_templates')
          .select(
            'name, language, body_text, header_type, header_content, buttons',
          )
          .eq('account_id', accountId)
          .eq('status', 'APPROVED')
          .order('name');
      return rows.map(ComposeTemplate.fromJson).toList();
    });

class AudienceOption {
  const AudienceOption(this.id, this.name, {this.note});
  final String id;
  final String name;
  final String? note;
}

final audienceTagsProvider = FutureProvider.autoDispose<List<AudienceOption>>((
  ref,
) async {
  final accountId = ref.watch(accountIdProvider);
  if (accountId == null) return const [];
  final rows = await sb
      .from('tags')
      .select('id, name')
      .eq('account_id', accountId)
      .order('name');
  return [
    for (final r in rows)
      AudienceOption(r['id'] as String, r['name'] as String),
  ];
});

final audienceSegmentsProvider =
    FutureProvider.autoDispose<List<AudienceOption>>((ref) async {
      final accountId = ref.watch(accountIdProvider);
      if (accountId == null) return const [];
      final rows = await sb
          .from('contact_segments')
          .select('id, name, kind')
          .eq('account_id', accountId)
          .order('name');
      return [
        for (final r in rows)
          AudienceOption(
            r['id'] as String,
            r['name'] as String,
            note: r['kind'] == 'dynamic' ? 'Live filter' : 'Fixed list',
          ),
      ];
    });

/// How many people have opted out, so the review step can say how many will
/// be skipped. Counts the whole workspace, not the chosen audience: it is a
/// reassurance, not a quote.
final optedOutCountProvider = FutureProvider.autoDispose<int>((ref) async {
  final accountId = ref.watch(accountIdProvider);
  if (accountId == null) return 0;
  final res = await sb
      .from('contacts')
      .select('id')
      .eq('account_id', accountId)
      .not('opted_out_at', 'is', null)
      .count();
  return res.count;
});
