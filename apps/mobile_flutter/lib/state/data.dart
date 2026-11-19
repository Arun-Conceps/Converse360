import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/models.dart';
import 'auth.dart';

// RLS scopes a browser query to the caller's MEMBERSHIPS, not to one workspace
// (see apps/web/src/lib/workspace/scope.ts). Every account-scoped read below
// therefore names the workspace itself, and does not run until it is known.

SupabaseClient get sb => Supabase.instance.client;

const _conversationSelect =
    '*, contact:contacts(id, phone, ig_username, name, company)';

/// Subscribes to a table for the provider's lifetime and refetches on change.
/// The channel is removed on dispose, which is what makes a workspace switch
/// tear down the previous workspace's realtime subscription.
void refetchOnChange(
  Ref ref, {
  required String channel,
  required String table,
  required String column,
  required String value,
}) {
  var disposed = false;
  final ch = sb
      .channel(channel)
      .onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: table,
        filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq, column: column, value: value),
        callback: (_) {
          if (!disposed) ref.invalidateSelf();
        },
      )
      .subscribe();
  ref.onDispose(() {
    disposed = true;
    sb.removeChannel(ch);
  });
}

final conversationsProvider =
    FutureProvider.autoDispose<List<Conversation>>((ref) async {
  final accountId = ref.watch(accountIdProvider);
  if (accountId == null) return const [];
  refetchOnChange(ref,
      channel: 'inbox:$accountId',
      table: 'conversations',
      column: 'account_id',
      value: accountId);
  final rows = await sb
      .from('conversations')
      .select(_conversationSelect)
      .eq('account_id', accountId)
      .order('last_message_at', ascending: false, nullsFirst: false)
      .limit(200);
  return rows.map(Conversation.fromJson).toList();
});

final conversationProvider =
    FutureProvider.autoDispose.family<Conversation, String>((ref, id) async {
  final accountId = ref.watch(accountIdProvider);
  if (accountId == null) throw StateError('No active workspace');
  refetchOnChange(ref,
      channel: 'conv:$accountId:$id',
      table: 'conversations',
      column: 'id',
      value: id);
  final row = await sb
      .from('conversations')
      .select(_conversationSelect)
      .eq('account_id', accountId)
      .eq('id', id)
      .single();
  return Conversation.fromJson(row);
});

final messagesProvider =
    FutureProvider.autoDispose.family<List<Message>, String>((ref, id) async {
  final accountId = ref.watch(accountIdProvider);
  if (accountId == null) return const [];
  refetchOnChange(ref,
      channel: 'thread:$accountId:$id',
      table: 'messages',
      column: 'conversation_id',
      value: id);
  // `messages` carries no account filter of its own: it inherits the scope from
  // its conversation, which this screen only reaches through the
  // workspace-scoped conversation query. Newest first so the list can reverse.
  final rows = await sb
      .from('messages')
      .select(
          'id, sender_type, content_type, content_text, template_name, media_url, status, created_at')
      .eq('conversation_id', id)
      .order('created_at', ascending: false)
      .limit(100);
  return rows.map(Message.fromJson).toList();
});

final contactsProvider =
    FutureProvider.autoDispose.family<List<Contact>, String>((ref, search) async {
  final accountId = ref.watch(accountIdProvider);
  if (accountId == null) return const [];
  // Strip PostgREST filter metacharacters from the user's search term.
  final term = search.trim().replaceAll(RegExp(r'[%,()]'), '');
  var q = sb
      .from('contacts')
      .select('id, phone, ig_username, name, company')
      .eq('account_id', accountId);
  if (term.isNotEmpty) {
    q = q.or('name.ilike.%$term%,phone.ilike.%$term%,company.ilike.%$term%');
  }
  final rows = await q.order('created_at', ascending: false).limit(100);
  return rows.map(Contact.fromJson).toList();
});

Future<void> markConversationRead(String accountId, String id) => sb
    .from('conversations')
    .update({'unread_count': 0})
    .eq('account_id', accountId)
    .eq('id', id);
