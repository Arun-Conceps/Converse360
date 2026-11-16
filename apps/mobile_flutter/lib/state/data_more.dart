import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models_more.dart';
import '../core/quick_replies.dart';
import 'auth.dart';
import 'data.dart';

// Same rule as data.dart: every account-scoped read names the workspace, and
// nothing runs until it is known.

/// Teammates of the ACTIVE workspace. Two steps and RLS is not one of them:
/// `profiles` is readable for anyone you share ANY workspace with, so an
/// unscoped select would offer other clients' staff as assignees. Membership
/// comes first and the profile lookup follows the ids it returns.
final membersProvider =
    FutureProvider.autoDispose<List<TeamMember>>((ref) async {
  final accountId = ref.watch(accountIdProvider);
  if (accountId == null) return const [];
  final members =
      await sb.from('account_members').select('user_id').eq('account_id', accountId);
  final ids = members.map((m) => m['user_id'] as String).toList();
  if (ids.isEmpty) return const [];
  final profiles = await sb
      .from('profiles')
      .select('user_id, full_name, email')
      .inFilter('user_id', ids)
      .order('full_name');
  return profiles
      .map((p) => TeamMember(
          userId: p['user_id'] as String,
          fullName: p['full_name'] as String?,
          email: p['email'] as String?))
      .toList();
});

// ---- notes -----------------------------------------------------------------

/// Notes belong to the CONTACT, so the same notes show in every conversation
/// with that person. Scoped by contact AND workspace.
final contactNotesProvider = FutureProvider.autoDispose
    .family<List<ContactNote>, String>((ref, contactId) async {
  final accountId = ref.watch(accountIdProvider);
  if (accountId == null) return const [];
  refetchOnChange(ref,
      channel: 'notes:$accountId:$contactId',
      table: 'contact_notes',
      column: 'contact_id',
      value: contactId);
  final rows = await sb
      .from('contact_notes')
      .select()
      .eq('contact_id', contactId)
      .eq('account_id', accountId)
      .order('created_at', ascending: true);
  return rows.map(ContactNote.fromJson).toList();
});

/// A note is a row in `contact_notes`; it never becomes a message, so it cannot
/// reach the customer. The notify trigger (migration 100) re-checks mentions.
Future<void> addNote({
  required String accountId,
  required String contactId,
  required String userId,
  required String text,
  required List<String> mentionedUserIds,
  String? conversationId,
}) =>
    sb.from('contact_notes').insert({
      'contact_id': contactId,
      'account_id': accountId,
      'user_id': userId,
      'note_text': text,
      'mentioned_user_ids': mentionedUserIds,
      'conversation_id': conversationId,
    });

// ---- quick replies ---------------------------------------------------------

final quickRepliesProvider =
    FutureProvider.autoDispose<List<QuickReply>>((ref) async {
  final accountId = ref.watch(accountIdProvider);
  if (accountId == null) return const [];
  final rows = await sb
      .from('quick_replies')
      .select('id, shortcut, body, use_count')
      .eq('account_id', accountId)
      .order('use_count', ascending: false)
      .order('shortcut');
  return rows.map(QuickReply.fromJson).toList();
});

Future<void> addQuickReply(String accountId, String userId, String shortcut, String body) =>
    sb.from('quick_replies').insert({
      'account_id': accountId,
      'shortcut': shortcut,
      'body': body,
      'created_by': userId,
    });

Future<void> deleteQuickReply(String accountId, String id) =>
    sb.from('quick_replies').delete().eq('account_id', accountId).eq('id', id);

Future<void> bumpQuickReplyUse(String accountId, QuickReply r) => sb
    .from('quick_replies')
    .update({'use_count': r.useCount + 1})
    .eq('account_id', accountId)
    .eq('id', r.id);

// ---- conversation actions --------------------------------------------------

Future<void> setConversationStatus(String accountId, String id, String status) =>
    sb.from('conversations').update({'status': status}).eq('account_id', accountId).eq('id', id);

Future<void> assignConversation(String accountId, String id, String? userId) => sb
    .from('conversations')
    .update({'assigned_agent_id': userId})
    .eq('account_id', accountId)
    .eq('id', id);

// ---- deals -----------------------------------------------------------------

final dealBoardProvider = FutureProvider.autoDispose<DealBoard>((ref) async {
  final accountId = ref.watch(accountIdProvider);
  if (accountId == null) return const DealBoard();
  final pipes = await sb
      .from('pipelines')
      .select('id, name')
      .eq('account_id', accountId)
      .order('created_at')
      .limit(1);
  if (pipes.isEmpty) return const DealBoard();
  final pid = pipes.first['id'] as String;
  final stages = await sb
      .from('pipeline_stages')
      .select('id, name, position')
      .eq('pipeline_id', pid)
      .order('position');
  final deals = await sb
      .from('deals')
      .select('id, stage_id, title, value, currency, contact_id, contact:contacts(name, phone)')
      .eq('pipeline_id', pid)
      .order('created_at', ascending: false);
  return DealBoard(
    pipelineName: pipes.first['name'] as String?,
    stages: stages.map(Stage.fromJson).toList(),
    deals: deals.map(Deal.fromJson).toList(),
  );
});

Future<void> moveDeal(String dealId, String stageId) =>
    sb.from('deals').update({'stage_id': stageId}).eq('id', dealId);

// ---- broadcasts & templates (read-only for now) ----------------------------

final broadcastsProvider =
    FutureProvider.autoDispose<List<Broadcast>>((ref) async {
  final accountId = ref.watch(accountIdProvider);
  if (accountId == null) return const [];
  refetchOnChange(ref,
      channel: 'broadcasts:$accountId',
      table: 'broadcasts',
      column: 'account_id',
      value: accountId);
  final rows = await sb
      .from('broadcasts')
      .select()
      .eq('account_id', accountId)
      .order('created_at', ascending: false)
      .limit(100);
  return rows.map(Broadcast.fromJson).toList();
});

final templatesProvider =
    FutureProvider.autoDispose<List<Template>>((ref) async {
  final accountId = ref.watch(accountIdProvider);
  if (accountId == null) return const [];
  final rows = await sb
      .from('message_templates')
      .select('id, name, category, body_text, status, rejection_reason')
      .eq('account_id', accountId)
      .order('created_at', ascending: false)
      .limit(200);
  return rows.map(Template.fromJson).toList();
});

// ---- notifications ---------------------------------------------------------

final notificationsProvider =
    FutureProvider.autoDispose<List<AppNotification>>((ref) async {
  final accountId = ref.watch(accountIdProvider);
  if (accountId == null) return const [];
  refetchOnChange(ref,
      channel: 'notifs:$accountId',
      table: 'notifications',
      column: 'account_id',
      value: accountId);
  final rows = await sb
      .from('notifications')
      .select()
      .eq('account_id', accountId)
      .order('created_at', ascending: false)
      .limit(100);
  return rows.map(AppNotification.fromJson).toList();
});

Future<void> markNotificationRead(String id) => sb
    .from('notifications')
    .update({'read_at': DateTime.now().toUtc().toIso8601String()})
    .eq('id', id)
    .isFilter('read_at', null);

Future<void> markAllNotificationsRead(String accountId) => sb
    .from('notifications')
    .update({'read_at': DateTime.now().toUtc().toIso8601String()})
    .eq('account_id', accountId)
    .isFilter('read_at', null);
