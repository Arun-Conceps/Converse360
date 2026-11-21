import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../core/api.dart';
import '../core/broadcast_compose.dart';
import '../core/theme.dart';
import '../state/auth.dart';
import '../state/broadcast_data.dart';
import '../state/data_more.dart';
import '../ui/widgets.dart';

/// Create and send a template broadcast from the phone.
///
/// Covers the common case (body variables, all contacts / tags / segments).
/// Templates that need a header file, a location or a button parameter are
/// shown greyed out with the reason, and are sent from the web.
///
/// Opted-out contacts (people who replied STOP) are skipped by the API on
/// every audience type — nothing here can include them.
class NewBroadcastScreen extends ConsumerStatefulWidget {
  const NewBroadcastScreen({super.key});
  @override
  ConsumerState<NewBroadcastScreen> createState() => _NewBroadcastScreenState();
}

class _NewBroadcastScreenState extends ConsumerState<NewBroadcastScreen> {
  final _name = TextEditingController();
  ComposeTemplate? _template;
  AudienceKind _kind = AudienceKind.all;
  final Set<String> _ids = {};
  final Map<String, VarFill> _fills = {};
  final Map<String, TextEditingController> _staticCtl = {};
  bool _sending = false;

  /// null = send now.
  DateTime? _when;
  bool _later = false;

  @override
  void dispose() {
    _name.dispose();
    for (final c in _staticCtl.values) {
      c.dispose();
    }
    super.dispose();
  }

  AudiencePick get _audience => AudiencePick(_kind, ids: _ids.toList());

  List<String> get _keys =>
      _template == null ? const [] : templateVariableKeys(_template!.body);

  bool get _ready =>
      _template != null &&
      _name.text.trim().isNotEmpty &&
      _audience.isComplete &&
      variablesComplete(_keys, _fills) &&
      (!_later || (_when != null && scheduleError(_when!, DateTime.now()) == null));

  Future<void> _pickWhen() async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: _when ?? now.add(const Duration(hours: 1)),
      firstDate: now,
      lastDate: now.add(maxScheduleAhead),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(
        _when ?? now.add(const Duration(hours: 1)),
      ),
    );
    if (time == null || !mounted) return;
    setState(
      () => _when = DateTime(
        date.year,
        date.month,
        date.day,
        time.hour,
        time.minute,
      ),
    );
  }

  String _whenLabel(DateTime d) => DateFormat('EEE d MMM, h:mm a').format(d);

  void _pickTemplate(ComposeTemplate t) {
    setState(() {
      _template = t;
      _fills.clear();
      for (final c in _staticCtl.values) {
        c.dispose();
      }
      _staticCtl.clear();
    });
  }

  Future<void> _review() async {
    final t = _template!;
    if (_later) {
      final err = scheduleError(_when!, DateTime.now());
      if (err != null) {
        _fail(err);
        return;
      }
    }
    final optedOut = await ref.read(optedOutCountProvider.future);
    if (!mounted) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Send this broadcast?'),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: C.out,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(previewBody(t.body, _fills)),
              ),
              const SizedBox(height: 12),
              Text('To: ${_audienceLabel()}'),
              const SizedBox(height: 6),
              Text(
                optedOut > 0
                    ? '$optedOut contact${optedOut == 1 ? '' : 's'} who replied STOP will be skipped automatically.'
                    : 'Anyone who replies STOP is skipped automatically.',
                style: const TextStyle(color: C.muted, fontSize: 13),
              ),
              const SizedBox(height: 6),
              Text(
                _later
                    ? 'Goes out ${_whenLabel(_when!)}. You can cancel it from the broadcast list until then. Anyone who replies STOP before then is skipped.'
                    : 'Messages go out right away and cannot be recalled.',
                style: const TextStyle(color: C.muted, fontSize: 13),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(_later ? 'Schedule' : 'Send now'),
          ),
        ],
      ),
    );
    if (ok == true) await _send();
  }

  String _audienceLabel() {
    switch (_kind) {
      case AudienceKind.all:
        return 'All contacts';
      case AudienceKind.tags:
        return '${_ids.length} tag${_ids.length == 1 ? '' : 's'}';
      case AudienceKind.segments:
        return '${_ids.length} segment${_ids.length == 1 ? '' : 's'}';
    }
  }

  Future<void> _send() async {
    setState(() => _sending = true);
    try {
      final res = await ref
          .read(apiProvider)
          .request(
            'POST',
            '/whatsapp/broadcasts',
            body: buildBroadcastBody(
              name: _name.text,
              template: _template!,
              audience: _audience,
              fills: _fills,
              scheduledAt: _later ? _when : null,
            ),
          );
      final n = res is Map ? res['total_recipients'] : null;
      ref.invalidate(broadcastsProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _later
                ? 'Scheduled for ${_whenLabel(_when!)}.'
                : n is int
                ? 'Broadcast queued for $n contact${n == 1 ? '' : 's'}.'
                : 'Broadcast queued.',
          ),
        ),
      );
      context.pop();
    } on ApiException catch (e) {
      if (mounted) _fail(e.message);
    } catch (_) {
      if (mounted) _fail('Could not reach the server.');
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _fail(String message) =>
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(message)));

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('New broadcast')),
      body: MaxWidth(
        child: ListView(
          padding: EdgeInsets.fromLTRB(
            16,
            8,
            16,
            24 + MediaQuery.paddingOf(context).bottom,
          ),
          children: [
            const SectionLabel('Name'),
            TextField(
              controller: _name,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                hintText: 'e.g. Diwali offer',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 18),
            const SectionLabel('Template'),
            _templates(),
            if (_keys.isNotEmpty) ...[
              const SizedBox(height: 18),
              const SectionLabel('Fill in the variables'),
              for (final k in _keys) _variableRow(k),
            ],
            const SizedBox(height: 18),
            const SectionLabel('Audience'),
            _audiencePicker(),
            const SizedBox(height: 18),
            const SectionLabel('When'),
            _whenPicker(),
            const SizedBox(height: 24),
            AppButton(
              _later ? 'Review and schedule' : 'Review and send',
              primary: true,
              loading: _sending,
              onPressed: _ready ? _review : null,
            ),
          ],
        ),
      ),
    );
  }

  Widget _whenPicker() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SegmentedButton<bool>(
          segments: const [
            ButtonSegment(value: false, label: Text('Send now')),
            ButtonSegment(value: true, label: Text('Schedule')),
          ],
          selected: {_later},
          showSelectedIcon: false,
          onSelectionChanged: (s) => setState(() {
            _later = s.first;
            if (!_later) _when = null;
          }),
        ),
        if (_later) ...[
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: _pickWhen,
            icon: const Icon(Icons.schedule),
            label: Text(
              _when == null ? 'Pick date and time' : _whenLabel(_when!),
            ),
          ),
          if (_when != null && scheduleError(_when!, DateTime.now()) != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                scheduleError(_when!, DateTime.now())!,
                style: const TextStyle(color: C.bad, fontSize: 12.5),
              ),
            ),
          const SizedBox(height: 6),
          const Text(
            'Uses this phone\'s time zone. The audience is fixed now; anyone who opts out before it goes out is still skipped.',
            style: TextStyle(color: C.muted, fontSize: 12.5),
          ),
        ],
      ],
    );
  }

  Widget _templates() {
    final t = ref.watch(composeTemplatesProvider);
    return t.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(16),
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (e, _) => Text('Could not load templates: $e'),
      data: (list) {
        if (list.isEmpty) {
          return const Text(
            'No approved templates yet. Create and submit one on the web first.',
            style: TextStyle(color: C.muted),
          );
        }
        return Column(
          spacing: 8,
          children: [
            for (final x in list)
              _TemplateTile(
                template: x,
                selected:
                    _template?.name == x.name &&
                    _template?.language == x.language,
                onTap: x.unsupportedReason == null
                    ? () => _pickTemplate(x)
                    : null,
              ),
          ],
        );
      },
    );
  }

  Widget _variableRow(String key) {
    final fill = _fills[key];
    final isField = fill is FieldFill;
    final ctl = _staticCtl.putIfAbsent(key, () => TextEditingController());
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('{{$key}}', style: const TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          SegmentedButton<bool>(
            segments: const [
              ButtonSegment(value: false, label: Text('Same for all')),
              ButtonSegment(value: true, label: Text("Contact's field")),
            ],
            selected: {isField},
            showSelectedIcon: false,
            onSelectionChanged: (s) => setState(() {
              _fills[key] = s.first
                  ? const FieldFill('name')
                  : StaticFill(ctl.text);
            }),
          ),
          const SizedBox(height: 8),
          if (isField)
            DropdownButtonFormField<String>(
              initialValue: fill.field,
              decoration: const InputDecoration(border: OutlineInputBorder()),
              items: const [
                DropdownMenuItem(value: 'name', child: Text('Name')),
                DropdownMenuItem(value: 'company', child: Text('Company')),
                DropdownMenuItem(value: 'email', child: Text('Email')),
                DropdownMenuItem(value: 'phone', child: Text('Phone')),
              ],
              onChanged: (v) =>
                  setState(() => _fills[key] = FieldFill(v ?? 'name')),
            )
          else
            TextField(
              controller: ctl,
              onChanged: (v) => setState(() => _fills[key] = StaticFill(v)),
              decoration: const InputDecoration(
                hintText: 'Text to send',
                border: OutlineInputBorder(),
              ),
            ),
        ],
      ),
    );
  }

  Widget _audiencePicker() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SegmentedButton<AudienceKind>(
          segments: const [
            ButtonSegment(value: AudienceKind.all, label: Text('All')),
            ButtonSegment(value: AudienceKind.tags, label: Text('Tags')),
            ButtonSegment(
              value: AudienceKind.segments,
              label: Text('Segments'),
            ),
          ],
          selected: {_kind},
          showSelectedIcon: false,
          onSelectionChanged: (s) => setState(() {
            _kind = s.first;
            _ids.clear();
          }),
        ),
        const SizedBox(height: 8),
        if (_kind == AudienceKind.all)
          const Text(
            'Every contact with a phone number.',
            style: TextStyle(color: C.muted),
          )
        else
          _options(
            _kind == AudienceKind.tags
                ? ref.watch(audienceTagsProvider)
                : ref.watch(audienceSegmentsProvider),
          ),
      ],
    );
  }

  Widget _options(AsyncValue<List<AudienceOption>> async) {
    return async.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(12),
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (e, _) => Text('Could not load: $e'),
      data: (list) => list.isEmpty
          ? Text(
              'None yet. Create ${_kind == AudienceKind.tags ? 'tags' : 'segments'} on the web or from a contact.',
              style: const TextStyle(color: C.muted),
            )
          : Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final o in list)
                  FilterChip(
                    label: Text(
                      o.note == null ? o.name : '${o.name} · ${o.note}',
                    ),
                    selected: _ids.contains(o.id),
                    onSelected: (v) =>
                        setState(() => v ? _ids.add(o.id) : _ids.remove(o.id)),
                  ),
              ],
            ),
    );
  }
}

class _TemplateTile extends StatelessWidget {
  const _TemplateTile({
    required this.template,
    required this.selected,
    required this.onTap,
  });
  final ComposeTemplate template;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final reason = template.unsupportedReason;
    return Opacity(
      opacity: onTap == null ? 0.55 : 1,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: selected ? C.accentSoft : C.surface,
            border: Border.all(color: selected ? C.accent : C.line),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                template.name,
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 4),
              Text(
                template.body,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: C.muted, fontSize: 13),
              ),
              if (reason != null) ...[
                const SizedBox(height: 6),
                Text(
                  reason,
                  style: const TextStyle(color: C.warn, fontSize: 12.5),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
