import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../core/api.dart';
import '../core/models_more.dart';
import '../state/auth.dart';
import '../core/theme.dart';
import '../state/data_more.dart';
import '../ui/widgets.dart';

/// Broadcast reports, the template list, and "New broadcast" (spec 3.5).
///
/// Creating a broadcast shipped together with opt-out handling (spec 3.4,
/// migration 102): contacts who replied STOP are skipped by the API on every
/// audience, so nothing on the phone can message them. A broadcast can be
/// scheduled (migration 103); until it goes out it can be cancelled from its
/// report sheet.
class SendScreen extends ConsumerStatefulWidget {
  const SendScreen({super.key});
  @override
  ConsumerState<SendScreen> createState() => _SendScreenState();
}

class _SendScreenState extends ConsumerState<SendScreen> {
  bool _reports = true;

  static int _pct(int part, int whole) =>
      whole == 0 ? 0 : (part * 100 / whole).round();

  EdgeInsets _listPadding(BuildContext context) =>
      EdgeInsets.fromLTRB(16, 4, 16, 16 + MediaQuery.paddingOf(context).bottom);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Send'), titleSpacing: 16),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/broadcasts/new'),
        icon: const Icon(Icons.campaign_outlined),
        label: const Text('New broadcast'),
      ),
      body: MaxWidth(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
              child: _Segmented(
                reports: _reports,
                onChanged: (v) => setState(() => _reports = v),
              ),
            ),
            Expanded(child: _reports ? _reportsList() : _templatesList()),
          ],
        ),
      ),
    );
  }

  // ---- reports ---------------------------------------------------------------

  Widget _reportsList() {
    final b = ref.watch(broadcastsProvider);
    return b.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => EmptyState('Could not load broadcasts', hint: '$e'),
      data: (list) => list.isEmpty
          ? const _Empty(
              icon: Icons.campaign_outlined,
              title: 'No broadcasts yet',
              hint: 'Tap New broadcast to send one. Results show here.',
            )
          : RefreshIndicator(
              onRefresh: () async => ref.refresh(broadcastsProvider.future),
              child: ListView.separated(
                padding: _listPadding(context),
                itemCount: list.length,
                separatorBuilder: (_, _) => const SizedBox(height: 10),
                itemBuilder: (_, i) =>
                    _BroadcastCard(x: list[i], onTap: () => _report(list[i])),
              ),
            ),
    );
  }

  Future<void> _cancel(Broadcast x) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel this broadcast?'),
        content: Text('"${x.name}" will not be sent.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Keep it'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Cancel broadcast'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await ref
          .read(apiProvider)
          .request('POST', '/whatsapp/broadcasts/${x.id}/cancel');
      ref.invalidate(broadcastsProvider);
      if (!mounted) return;
      Navigator.of(context).maybePop(); // close the report sheet
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Broadcast cancelled.')));
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not reach the server.')),
        );
      }
    }
  }

  void _report(Broadcast x) {
    Widget stat(IconData icon, String label, int v, {int? of}) => Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: C.surface2,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        spacing: 10,
        children: [
          IconTile(icon, size: 36),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$v',
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                Text(
                  of == null ? label : '$label · ${_pct(v, of)}%',
                  style: const TextStyle(fontSize: 12, color: C.muted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
    showAppSheet<void>(
      context,
      builder: (_) => Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 10,
        children: [
          Wrap(
            spacing: 10,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(
                x.name,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                ),
              ),
              StatusChip(x.status),
            ],
          ),
          Row(
            spacing: 6,
            children: [
              const Icon(Icons.description_outlined, size: 16, color: C.muted),
              Expanded(
                child: Text(
                  'Template: ${x.templateName}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: C.muted),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          ResponsiveGrid(
            children: [
              stat(Icons.send_outlined, 'Sent', x.sent),
              stat(Icons.done_all, 'Delivered', x.delivered, of: x.sent),
              stat(Icons.visibility_outlined, 'Read', x.read, of: x.sent),
              stat(Icons.reply_outlined, 'Replied', x.replied, of: x.sent),
            ],
          ),
          if (x.status == 'scheduled')
            AppButton(
              'Cancel scheduled broadcast',
              danger: true,
              onPressed: () => _cancel(x),
            ),
          if (x.failed > 0)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: C.badSoft,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                spacing: 8,
                children: [
                  const Icon(Icons.error_outline, color: C.bad, size: 18),
                  Expanded(
                    child: Text(
                      '${x.failed} messages failed to send',
                      style: const TextStyle(
                        color: C.bad,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  // ---- templates -------------------------------------------------------------

  Widget _templatesList() {
    final t = ref.watch(templatesProvider);
    return t.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => EmptyState('Could not load templates', hint: '$e'),
      data: (list) => list.isEmpty
          ? const _Empty(
              icon: Icons.description_outlined,
              title: 'No templates yet',
              hint: 'WhatsApp templates you create on the web show up here.',
            )
          : RefreshIndicator(
              onRefresh: () async => ref.refresh(templatesProvider.future),
              child: ListView.separated(
                padding: _listPadding(context),
                itemCount: list.length,
                separatorBuilder: (_, _) => const SizedBox(height: 10),
                itemBuilder: (_, i) =>
                    _TemplateCard(x: list[i], onTap: () => _template(list[i])),
              ),
            ),
    );
  }

  void _template(Template x) => showAppSheet<void>(
    context,
    builder: (_) => Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      spacing: 12,
      children: [
        Text(
          x.name,
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
        ),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            StatusChip(x.status),
            if (x.category.isNotEmpty) _Category(x.category),
          ],
        ),
        _Bubble(x.body),
        if (x.rejectionReason != null)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: C.badSoft,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              'Meta said: ${x.rejectionReason}',
              style: const TextStyle(color: C.bad),
            ),
          ),
      ],
    ),
  );
}

/// Two-option switch: a white track with the chosen side filled green.
class _Segmented extends StatelessWidget {
  const _Segmented({required this.reports, required this.onChanged});
  final bool reports;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    Widget side(bool value, IconData icon, String label) {
      final on = reports == value;
      return Expanded(
        child: Semantics(
          button: true,
          selected: on,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => onChanged(value),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              height: kHit,
              decoration: BoxDecoration(
                color: on ? C.accent : Colors.transparent,
                borderRadius: BorderRadius.circular(99),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                spacing: 6,
                children: [
                  Icon(icon, size: 18, color: on ? Colors.white : C.muted),
                  Text(
                    label,
                    style: TextStyle(
                      color: on ? Colors.white : C.muted,
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: cardDecoration(radius: 99),
      child: Row(
        children: [
          side(true, Icons.insights_outlined, 'Reports'),
          side(false, Icons.description_outlined, 'Templates'),
        ],
      ),
    );
  }
}

class _BroadcastCard extends StatelessWidget {
  const _BroadcastCard({required this.x, required this.onTap});
  final Broadcast x;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheduled = x.status == 'scheduled' && x.scheduledAt != null;
    final readPct = _SendScreenState._pct(x.read, x.sent);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Ink(
          decoration: cardDecoration(),
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            spacing: 10,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: 12,
                children: [
                  IconTile(Icons.campaign_outlined, filled: x.status == 'sent'),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      spacing: 3,
                      children: [
                        Text(
                          x.name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 15,
                            height: 1.25,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          scheduled
                              ? 'Goes out ${DateFormat.MMMd().add_jm().format(x.scheduledAt!.toLocal())}'
                              : DateFormat.yMMMd().format(
                                  x.createdAt.toLocal(),
                                ),
                          style: const TextStyle(
                            color: C.muted,
                            fontSize: 12.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                  StatusChip(x.status),
                ],
              ),
              if (!scheduled && x.status != 'draft') ...[
                Row(
                  spacing: 16,
                  children: [
                    _Metric(Icons.send_outlined, '${x.sent}', 'sent'),
                    _Metric(Icons.visibility_outlined, '$readPct%', 'read'),
                    if (x.replied > 0)
                      _Metric(Icons.reply_outlined, '${x.replied}', 'replied'),
                  ],
                ),
                ClipRRect(
                  borderRadius: BorderRadius.circular(99),
                  child: LinearProgressIndicator(
                    value: readPct / 100,
                    minHeight: 6,
                    color: C.accent,
                    backgroundColor: C.accentSoft,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric(this.icon, this.value, this.label);
  final IconData icon;
  final String value;
  final String label;
  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    spacing: 4,
    children: [
      Icon(icon, size: 15, color: C.accent),
      Text(
        value,
        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800),
      ),
      Text(label, style: const TextStyle(fontSize: 12.5, color: C.muted)),
    ],
  );
}

class _TemplateCard extends StatelessWidget {
  const _TemplateCard({required this.x, required this.onTap});
  final Template x;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: Colors.transparent,
    child: InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: onTap,
      child: Ink(
        decoration: cardDecoration(),
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: 10,
          children: [
            Row(
              spacing: 12,
              children: [
                const IconTile(Icons.description_outlined, size: 38),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    spacing: 2,
                    children: [
                      Text(
                        x.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      if (x.category.isNotEmpty)
                        Text(
                          _Category.pretty(x.category),
                          style: const TextStyle(color: C.muted, fontSize: 12),
                        ),
                    ],
                  ),
                ),
                StatusChip(x.status),
              ],
            ),
            _Bubble(x.body, maxLines: 2),
          ],
        ),
      ),
    ),
  );
}

/// The template text drawn like the WhatsApp message the customer receives.
class _Bubble extends StatelessWidget {
  const _Bubble(this.text, {this.maxLines});
  final String text;
  final int? maxLines;
  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
    decoration: const BoxDecoration(
      color: C.out,
      borderRadius: BorderRadius.only(
        topLeft: Radius.circular(4),
        topRight: Radius.circular(14),
        bottomLeft: Radius.circular(14),
        bottomRight: Radius.circular(14),
      ),
    ),
    child: Text(
      text,
      maxLines: maxLines,
      overflow: maxLines == null ? null : TextOverflow.ellipsis,
      style: const TextStyle(fontSize: 13.5, height: 1.4, color: C.fg),
    ),
  );
}

class _Category extends StatelessWidget {
  const _Category(this.category);
  final String category;
  static String pretty(String c) {
    final s = c.toLowerCase().replaceAll('_', ' ');
    return s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';
  }

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
    decoration: BoxDecoration(
      color: C.surface2,
      borderRadius: BorderRadius.circular(99),
    ),
    child: Text(
      pretty(category),
      style: const TextStyle(
        color: C.muted,
        fontSize: 11.5,
        fontWeight: FontWeight.w700,
      ),
    ),
  );
}

class _Empty extends StatelessWidget {
  const _Empty({required this.icon, required this.title, required this.hint});
  final IconData icon;
  final String title;
  final String hint;
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        spacing: 10,
        children: [
          CircleAvatar(
            radius: 36,
            backgroundColor: C.accentSoft,
            child: Icon(icon, size: 34, color: C.accent),
          ),
          const SizedBox(height: 4),
          Text(
            title,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          ),
          Text(
            hint,
            textAlign: TextAlign.center,
            style: const TextStyle(color: C.muted, height: 1.4),
          ),
        ],
      ),
    ),
  );
}
