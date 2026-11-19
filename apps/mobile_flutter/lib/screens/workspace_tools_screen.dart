import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/theme.dart';
import '../state/data_tools.dart';
import '../ui/widgets.dart';

/// Read-only look at what the workspace has built on the web: segments,
/// automations, flows and AI agents. Editing stays on the web on purpose —
/// these are graphs and rule sets that need the full canvas.
class WorkspaceToolsScreen extends ConsumerWidget {
  const WorkspaceToolsScreen({super.key, this.initialTab = 0});
  final int initialTab;

  static final _tabs = [
    _Tab(
      label: 'Segments',
      noun: 'segment',
      icon: Icons.groups_2_outlined,
      metaIcon: Icons.play_arrow_rounded,
      emptyTitle: 'No segments yet',
      emptyHint: 'Create audiences on the web and they show up here.',
      provider: segmentsProvider,
    ),
    _Tab(
      label: 'Automations',
      noun: 'automation',
      icon: Icons.bolt_outlined,
      metaIcon: Icons.play_arrow_rounded,
      emptyTitle: 'No automations yet',
      emptyHint: 'Build them on the web; run counts show here.',
      provider: automationsProvider,
    ),
    _Tab(
      label: 'Flows',
      noun: 'flow',
      icon: Icons.account_tree_outlined,
      metaIcon: Icons.play_arrow_rounded,
      emptyTitle: 'No flows yet',
      emptyHint: 'Chatbot flows are built on the web.',
      provider: flowsProvider,
    ),
    _Tab(
      label: 'AI agents',
      noun: 'agent',
      icon: Icons.smart_toy_outlined,
      metaIcon: Icons.format_list_numbered,
      emptyTitle: 'No AI agents yet',
      emptyHint: 'Set up agents on the web, then check their status here.',
      provider: aiAgentsProvider,
    ),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return DefaultTabController(
      length: _tabs.length,
      initialIndex: initialTab,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Workspace tools'),
          leading: IconButton(
            icon: const Icon(Icons.chevron_left, size: 28),
            onPressed: () => context.pop(),
          ),
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(56),
            child: SizedBox(
              height: 56,
              child: TabBar(
                isScrollable: true,
                tabAlignment: TabAlignment.start,
                padding: const EdgeInsets.fromLTRB(12, 6, 12, 10),
                labelPadding: const EdgeInsets.symmetric(horizontal: 4),
                dividerColor: Colors.transparent,
                indicatorSize: TabBarIndicatorSize.tab,
                indicator: BoxDecoration(
                  color: C.accent,
                  borderRadius: BorderRadius.circular(99),
                ),
                labelColor: Colors.white,
                unselectedLabelColor: C.muted,
                labelStyle: const TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 13.5,
                ),
                unselectedLabelStyle: const TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 13.5,
                ),
                splashBorderRadius: BorderRadius.circular(99),
                tabs: [
                  for (final t in _tabs)
                    Tab(
                      height: 38,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 10),
                        child: Row(
                          spacing: 6,
                          children: [Icon(t.icon, size: 17), Text(t.label)],
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
        body: TabBarView(children: [for (final t in _tabs) _List(tab: t)]),
      ),
    );
  }
}

class _Tab {
  const _Tab({
    required this.label,
    required this.noun,
    required this.icon,
    required this.metaIcon,
    required this.emptyTitle,
    required this.emptyHint,
    required this.provider,
  });
  final String label;
  final String noun;
  final IconData icon;
  final IconData metaIcon;
  final String emptyTitle;
  final String emptyHint;
  final FutureProvider<List<ToolRow>> provider;
}

class _List extends ConsumerWidget {
  const _List({required this.tab});
  final _Tab tab;

  /// "4 segments · 2 Static · 2 Dynamic" or "3 automations · 2 active".
  String _summary(List<ToolRow> list) {
    final n = list.length;
    final head = '$n ${tab.noun}${n == 1 ? '' : 's'}';
    if (list.any((r) => r.active != null)) {
      return '$head  ·  ${list.where((r) => r.active == true).length} active';
    }
    final counts = <String, int>{};
    for (final r in list) {
      if (r.badge != null && r.badge!.isNotEmpty) {
        counts[r.badge!] = (counts[r.badge!] ?? 0) + 1;
      }
    }
    return [
      head,
      for (final e in counts.entries) '${e.value} ${e.key}',
    ].join('  ·  ');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rows = ref.watch(tab.provider);
    return rows.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => EmptyState('Could not load this list', hint: '$e'),
      data: (list) {
        if (list.isEmpty) {
          return _Empty(
            icon: tab.icon,
            title: tab.emptyTitle,
            hint: tab.emptyHint,
          );
        }
        return RefreshIndicator(
          onRefresh: () async => ref.refresh(tab.provider.future),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      _summary(list),
                      style: const TextStyle(
                        color: C.fg,
                        fontWeight: FontWeight.w700,
                        fontSize: 13.5,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              for (final r in list) ...[
                _Card(row: r, icon: tab.icon, metaIcon: tab.metaIcon),
                const SizedBox(height: 10),
              ],
            ],
          ),
        );
      },
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.row, required this.icon, required this.metaIcon});
  final ToolRow row;
  final IconData icon;
  final IconData metaIcon;

  @override
  Widget build(BuildContext context) {
    final r = row;
    // A row with an on/off state shows ONE status chip: its own label (e.g.
    // "Published", "Draft") when it has one, else Active / Off.
    final hasBadge = r.badge != null && r.badge!.isNotEmpty;
    final status = r.active == null
        ? null
        : (hasBadge ? r.badge! : (r.active! ? 'Active' : 'Off'));
    final kind = r.active == null && hasBadge ? r.badge! : null;
    final dim = r.active == false;

    return Container(
      decoration: BoxDecoration(
        color: C.surface,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      padding: const EdgeInsets.all(14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 12,
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: dim ? C.surface2 : C.accentSoft,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, size: 22, color: dim ? C.muted : C.accent),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 4,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: 8,
                  children: [
                    Expanded(
                      child: Text(
                        r.title,
                        style: const TextStyle(
                          fontSize: 15,
                          height: 1.25,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    if (status != null) _Status(status, on: r.active!),
                    if (kind != null) _Kind(kind),
                  ],
                ),
                Text(
                  r.subtitle,
                  style: const TextStyle(
                    color: C.muted,
                    fontSize: 12.5,
                    height: 1.35,
                  ),
                ),
                if (r.meta != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Row(
                      spacing: 4,
                      children: [
                        Icon(metaIcon, size: 15, color: C.accent),
                        Text(
                          r.meta!,
                          style: const TextStyle(
                            color: C.fg,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// On = filled green with a dot; off = grey. Never colour alone: the word says it.
class _Status extends StatelessWidget {
  const _Status(this.label, {required this.on});
  final String label;
  final bool on;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
    decoration: BoxDecoration(
      color: on ? C.accentSoft : C.surface2,
      borderRadius: BorderRadius.circular(99),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      spacing: 5,
      children: [
        Container(
          width: 6,
          height: 6,
          decoration: BoxDecoration(
            color: on ? C.accent : C.muted,
            shape: BoxShape.circle,
          ),
        ),
        Text(
          label,
          style: TextStyle(
            color: on ? C.accent : C.muted,
            fontSize: 11.5,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    ),
  );
}

/// Segment kind: Dynamic updates itself, Static is a fixed list.
class _Kind extends StatelessWidget {
  const _Kind(this.label);
  final String label;
  @override
  Widget build(BuildContext context) {
    final dynamic_ = label.toLowerCase() == 'dynamic';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        border: Border.all(color: C.accent.withValues(alpha: 0.35)),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        spacing: 4,
        children: [
          Icon(
            dynamic_ ? Icons.autorenew : Icons.list_alt,
            size: 13,
            color: C.accent,
          ),
          Text(
            label,
            style: const TextStyle(
              color: C.accent,
              fontSize: 11.5,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
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
          Container(
            width: 72,
            height: 72,
            decoration: const BoxDecoration(
              color: C.accentSoft,
              shape: BoxShape.circle,
            ),
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
