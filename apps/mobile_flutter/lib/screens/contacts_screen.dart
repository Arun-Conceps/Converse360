import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/inbox_logic.dart';
import '../core/theme.dart';
import '../state/data.dart';
import '../ui/widgets.dart';

class ContactsScreen extends ConsumerStatefulWidget {
  const ContactsScreen({super.key});
  @override
  ConsumerState<ContactsScreen> createState() => _ContactsScreenState();
}

class _ContactsScreenState extends ConsumerState<ContactsScreen> {
  String _q = '';
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  // Debounced: each distinct term is its own provider instance and query.
  void _onSearch(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      if (mounted) setState(() => _q = v);
    });
  }

  @override
  Widget build(BuildContext context) {
    final contacts = ref.watch(contactsProvider(_q));
    return Scaffold(
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Contacts'),
          if (contacts.value != null)
            Text(
                '${contacts.value!.length}${contacts.value!.length == 100 ? '+' : ''} people',
                style: const TextStyle(
                    fontSize: 12, color: C.muted, fontWeight: FontWeight.w400)),
        ]),
      ),
      body: Column(children: [
        SearchField(hint: 'Search name, phone or company', onChanged: _onSearch),
        const Divider(),
        Expanded(
          child: contacts.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => EmptyState('Could not load contacts', hint: '$e'),
            data: (rows) => rows.isEmpty
                ? const EmptyState('No matches')
                : ListView.builder(
                    itemCount: rows.length,
                    itemBuilder: (_, i) {
                      final c = rows[i];
                      final name = contactName(c);
                      final sub = [c.phone, c.company]
                          .where((s) => s != null && s.isNotEmpty)
                          .join(' · ');
                      return InkWell(
                        onTap: () => context.push('/contact/${c.id}'),
                        child: Container(
                        constraints: const BoxConstraints(minHeight: kHit),
                        padding: const EdgeInsets.all(12),
                        decoration: const BoxDecoration(
                            color: C.surface,
                            border: Border(bottom: BorderSide(color: C.line))),
                        child: Row(spacing: 10, children: [
                          AppAvatar(name),
                          Expanded(
                            child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(name,
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w600)),
                                  if (sub.isNotEmpty)
                                    Text(sub,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                            color: C.muted, fontSize: 12.5)),
                                ]),
                          ),
                        ]),
                      ));
                    },
                  ),
          ),
        ),
      ]),
    );
  }
}
