import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models.dart';
import 'auth.dart';
import 'data.dart';

class ContactDetail {
  const ContactDetail(this.contact, this.conversationId);
  final Contact contact;
  final String? conversationId;
}

/// One contact plus its most recent conversation (to open the chat).
/// Both reads name the workspace.
final contactDetailProvider =
    FutureProvider.autoDispose.family<ContactDetail, String>((ref, id) async {
  final accountId = ref.watch(accountIdProvider);
  if (accountId == null) throw StateError('No active workspace');
  final row = await sb
      .from('contacts')
      .select('id, phone, ig_username, name, company')
      .eq('account_id', accountId)
      .eq('id', id)
      .single();
  final conv = await sb
      .from('conversations')
      .select('id')
      .eq('account_id', accountId)
      .eq('contact_id', id)
      .order('last_message_at', ascending: false, nullsFirst: false)
      .limit(1);
  return ContactDetail(
      Contact.fromJson(row), conv.isEmpty ? null : conv.first['id'] as String);
});
