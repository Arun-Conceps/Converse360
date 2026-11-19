import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'auth.dart';
import 'data.dart';

/// One line in a read-only workspace list (segment, automation, flow, agent).
class ToolRow {
  const ToolRow({
    required this.title,
    required this.subtitle,
    this.badge,
    this.active,
    this.meta,
  });
  final String title;
  final String subtitle;
  final String? badge;

  /// null = the thing has no on/off state.
  final bool? active;
  final String? meta;
}

String _pretty(String? s) =>
    (s ?? '').replaceAll('_', ' ').trim().isEmpty ? '' : '${s![0].toUpperCase()}${s.substring(1).replaceAll('_', ' ')}';

// Same rule as the rest of the app: RLS scopes to MEMBERSHIPS, so every query
// names the active workspace itself.

final segmentsProvider =
    FutureProvider.autoDispose<List<ToolRow>>((ref) async {
  final accountId = ref.watch(accountIdProvider);
  if (accountId == null) return const [];
  final rows = await sb
      .from('contact_segments')
      .select('name, description, kind')
      .eq('account_id', accountId)
      .order('created_at', ascending: false);
  return rows
      .map((r) => ToolRow(
            title: r['name'] as String,
            subtitle: (r['description'] as String?)?.trim().isNotEmpty == true
                ? r['description'] as String
                : (r['kind'] == 'dynamic'
                    ? 'Saved filter, updates itself'
                    : 'Fixed list of contacts'),
            badge: _pretty(r['kind'] as String?),
          ))
      .toList();
});

final automationsProvider =
    FutureProvider.autoDispose<List<ToolRow>>((ref) async {
  final accountId = ref.watch(accountIdProvider);
  if (accountId == null) return const [];
  final rows = await sb
      .from('automations')
      .select('name, trigger_type, is_active, execution_count, channels')
      .eq('account_id', accountId)
      .order('created_at', ascending: false);
  return rows.map((r) {
    final ch = (r['channels'] as List?)?.cast<String>() ?? const [];
    return ToolRow(
      title: r['name'] as String,
      subtitle:
          'When: ${_pretty(r['trigger_type'] as String?).toLowerCase()}${ch.isEmpty ? '' : '  ·  ${ch.join(', ')}'}',
      active: r['is_active'] as bool? ?? false,
      meta: '${r['execution_count'] ?? 0} runs',
    );
  }).toList();
});

final flowsProvider = FutureProvider.autoDispose<List<ToolRow>>((ref) async {
  final accountId = ref.watch(accountIdProvider);
  if (accountId == null) return const [];
  final rows = await sb
      .from('flows')
      .select('name, description, status, trigger_type, execution_count')
      .eq('account_id', accountId)
      .order('created_at', ascending: false);
  return rows.map((r) {
    final status = r['status'] as String? ?? 'draft';
    return ToolRow(
      title: r['name'] as String,
      subtitle: (r['description'] as String?)?.trim().isNotEmpty == true
          ? r['description'] as String
          : 'Starts on: ${_pretty(r['trigger_type'] as String?).toLowerCase()}',
      badge: _pretty(status),
      active: status == 'active' || status == 'published',
      meta: '${r['execution_count'] ?? 0} runs',
    );
  }).toList();
});

final aiAgentsProvider = FutureProvider.autoDispose<List<ToolRow>>((ref) async {
  final accountId = ref.watch(accountIdProvider);
  if (accountId == null) return const [];
  final rows = await sb
      .from('ai_agents')
      .select(
          'name, channels, priority, is_active, auto_reply_enabled, test_mode')
      .eq('account_id', accountId)
      .order('priority');
  return rows.map((r) {
    final ch = (r['channels'] as List?)?.cast<String>() ?? const [];
    final mode = r['test_mode'] == true
        ? 'Test mode'
        : r['auto_reply_enabled'] == true
            ? 'Auto-replies'
            : 'Drafts only';
    return ToolRow(
      title: r['name'] as String,
      subtitle: '$mode  ·  ${ch.isEmpty ? 'any channel' : ch.join(', ')}',
      active: r['is_active'] as bool? ?? false,
      meta: 'Priority ${r['priority']}',
    );
  }).toList();
});
