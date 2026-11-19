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

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    const tabs = [
      ('Segments', 'No segments yet', 'Create audiences on the web and they show up here.'),
      ('Automations', 'No automations yet', 'Build them on the web; run counts show here.'),
      ('Flows', 'No flows yet', 'Chatbot flows are built on the web.'),
      ('AI agents', 'No AI agents yet', 'Set up agents on the web, then check their status here.'),
    ];
    final providers = [
      segmentsProvider,
      automationsProvider,
      flowsProvider,
      aiAgentsProvider,
    ];
    return DefaultTabController(
      length: tabs.length,
      initialIndex: initialTab,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Workspace tools'),
          leading: IconButton(
              icon: const Icon(Icons.chevron_left, size: 28),
              onPressed: () => context.pop()),
          bottom: TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            tabs: [for (final t in tabs) Tab(text: t.$1)],
          ),
        ),
        body: TabBarView(children: [
          for (var i = 0; i < tabs.length; i++)
            _List(provider: providers[i], emptyTitle: tabs[i].$2, emptyHint: tabs[i].$3),
        ]),
      ),
    );
  }
}

class _List extends ConsumerWidget {
  const _List(
      {required this.provider, required this.emptyTitle, required this.emptyHint});
  final FutureProvider<List<ToolRow>> provider;
  final String emptyTitle;
  final String emptyHint;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rows = ref.watch(provider);
    return rows.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => EmptyState('Could not load this list', hint: '$e'),
      data: (list) {
        if (list.isEmpty) return EmptyState(emptyTitle, hint: emptyHint);
        return RefreshIndicator(
          onRefresh: () async => ref.refresh(provider.future),
          child: ListView.separated(
            padding: const EdgeInsets.all(14),
            itemCount: list.length,
            separatorBuilder: (_, _) => const SizedBox(height: 8),
            itemBuilder: (_, i) {
              final r = list[i];
              return Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                    color: C.surface,
                    border: Border.all(color: C.line),
                    borderRadius: BorderRadius.circular(14)),
                child: Row(spacing: 10, children: [
                  Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        spacing: 3,
                        children: [
                          Text(r.title,
                              style: const TextStyle(fontWeight: FontWeight.w600)),
                          Text(r.subtitle,
                              style: const TextStyle(color: C.muted, fontSize: 12.5)),
                          if (r.meta != null)
                            Text(r.meta!,
                                style: const TextStyle(color: C.muted, fontSize: 12)),
                        ]),
                  ),
                  Column(crossAxisAlignment: CrossAxisAlignment.end, spacing: 4, children: [
                    if (r.active != null)
                      Pill(r.active! ? 'Active' : 'Off',
                          tone: r.active! ? PillTone.ok : PillTone.plain),
                    if (r.badge != null && r.badge!.isNotEmpty) Pill(r.badge!),
                  ]),
                ]),
              );
            },
          ),
        );
      },
    );
  }
}
