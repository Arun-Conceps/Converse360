import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../core/models_more.dart';
import '../core/theme.dart';
import '../state/data_more.dart';
import '../ui/widgets.dart';

/// Broadcast reports and the template list (spec 3.5).
///
/// READ-ONLY on purpose: creating or scheduling a broadcast ships together with
/// opt-out handling (spec 3.4), so nobody who said STOP can be messaged.
class SendScreen extends ConsumerStatefulWidget {
  const SendScreen({super.key});
  @override
  ConsumerState<SendScreen> createState() => _SendScreenState();
}

class _SendScreenState extends ConsumerState<SendScreen> {
  bool _reports = true;

  PillTone _tone(String status) => switch (status.toLowerCase()) {
        'sent' || 'approved' => PillTone.ok,
        'sending' || 'queued' || 'pending' || 'scheduled' => PillTone.warn,
        'failed' || 'rejected' => PillTone.bad,
        _ => PillTone.plain,
      };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Send')),
      body: Column(children: [
        Container(
          color: C.surface,
          padding: const EdgeInsets.fromLTRB(14, 8, 14, 8),
          child: Row(spacing: 6, children: [
            ChoiceChip(
                label: const Text('Reports'),
                selected: _reports,
                onSelected: (_) => setState(() => _reports = true)),
            ChoiceChip(
                label: const Text('Templates'),
                selected: !_reports,
                onSelected: (_) => setState(() => _reports = false)),
          ]),
        ),
        const Divider(),
        const BannerStrip(
            'Create and schedule broadcasts on the web for now. The app will add it together with opt-out handling.'),
        Expanded(child: _reports ? _reportsList() : _templatesList()),
      ]),
    );
  }

  Widget _reportsList() {
    final b = ref.watch(broadcastsProvider);
    return b.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => EmptyState('Could not load broadcasts', hint: '$e'),
      data: (list) => list.isEmpty
          ? const EmptyState('No broadcasts yet')
          : RefreshIndicator(
              onRefresh: () async => ref.refresh(broadcastsProvider.future),
              child: ListView.builder(
                itemCount: list.length,
                itemBuilder: (_, i) {
                  final x = list[i];
                  final readPct = x.sent == 0 ? 0 : (x.read * 100 / x.sent).round();
                  return ListTile(
                    tileColor: C.surface,
                    title: Text(x.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text(x.status == 'scheduled' && x.scheduledAt != null
                        ? 'Goes out ${DateFormat.MMMd().add_jm().format(x.scheduledAt!.toLocal())}'
                        : '${x.sent} sent · $readPct% read · ${DateFormat.MMMd().format(x.createdAt.toLocal())}'),
                    trailing: Pill(x.status, tone: _tone(x.status)),
                    onTap: () => _report(x),
                  );
                },
              ),
            ),
    );
  }

  void _report(Broadcast x) {
    Widget stat(String l, int v) => Expanded(
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
                color: C.surface,
                border: Border.all(color: C.line),
                borderRadius: BorderRadius.circular(14)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('$v', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w600)),
              Text(l, style: const TextStyle(fontSize: 12, color: C.muted)),
            ]),
          ),
        );
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(mainAxisSize: MainAxisSize.min, spacing: 10, children: [
            Text(x.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            Text('Template: ${x.templateName}', style: const TextStyle(color: C.muted)),
            Row(spacing: 10, children: [stat('Sent', x.sent), stat('Delivered', x.delivered)]),
            Row(spacing: 10, children: [stat('Read', x.read), stat('Replied', x.replied)]),
            if (x.failed > 0)
              Align(
                alignment: Alignment.centerLeft,
                child: Pill('${x.failed} failed', tone: PillTone.bad),
              ),
          ]),
        ),
      ),
    );
  }

  Widget _templatesList() {
    final t = ref.watch(templatesProvider);
    return t.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => EmptyState('Could not load templates', hint: '$e'),
      data: (list) => list.isEmpty
          ? const EmptyState('No templates yet')
          : ListView.builder(
              itemCount: list.length,
              itemBuilder: (_, i) {
                final x = list[i];
                return ListTile(
                  tileColor: C.surface,
                  title: Text(x.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Text(x.body, maxLines: 2, overflow: TextOverflow.ellipsis),
                  trailing: Pill(x.status.toLowerCase(), tone: _tone(x.status)),
                  onTap: () => showModalBottomSheet<void>(
                    context: context,
                    showDragHandle: true,
                    builder: (_) => SafeArea(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                        child: Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            spacing: 10,
                            children: [
                              Text(x.name,
                                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                              Row(spacing: 6, children: [
                                Pill(x.status.toLowerCase(), tone: _tone(x.status)),
                                Pill(x.category),
                              ]),
                              Container(
                                  width: double.infinity,
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                      color: C.out, borderRadius: BorderRadius.circular(12)),
                                  child: Text(x.body)),
                              if (x.rejectionReason != null)
                                Text('Meta said: ${x.rejectionReason}',
                                    style: const TextStyle(color: C.bad)),
                            ]),
                      ),
                    ),
                  ),
                );
              },
            ),
    );
  }
}
