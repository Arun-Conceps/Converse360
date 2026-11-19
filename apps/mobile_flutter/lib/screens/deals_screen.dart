import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../core/inbox_logic.dart';
import '../core/models_more.dart';
import '../core/theme.dart';
import '../state/auth.dart';
import '../state/data_more.dart';
import '../ui/widgets.dart';

/// Deals board: stage tabs on top, one swipeable column per stage, move a deal
/// with the named buttons on its card (spec 3.9).
class DealsScreen extends ConsumerStatefulWidget {
  const DealsScreen({super.key});
  @override
  ConsumerState<DealsScreen> createState() => _DealsScreenState();
}

class _DealsScreenState extends ConsumerState<DealsScreen> {
  final _page = PageController(viewportFraction: 0.92);
  final _tabKeys = <int, GlobalKey>{};
  int _index = 0;
  String? _moving;

  static final _money = NumberFormat.decimalPattern('en_IN');
  static final _compact = NumberFormat.compactCurrency(
      locale: 'en_IN', symbol: '₹', decimalDigits: 1);

  @override
  void dispose() {
    _page.dispose();
    super.dispose();
  }

  String _fmt(Deal d) =>
      '${d.currency == 'USD' ? r'$' : '₹'}${_money.format(d.value)}';

  void _onPage(int i) {
    setState(() => _index = i);
    final ctx = _tabKeys[i]?.currentContext;
    if (ctx != null) {
      Scrollable.ensureVisible(ctx,
          alignment: 0.5, duration: const Duration(milliseconds: 250));
    }
  }

  void _goTo(int i) => _page.animateToPage(i,
      duration: const Duration(milliseconds: 300), curve: Curves.easeOutCubic);

  Future<void> _move(Deal d, Stage to) async {
    setState(() => _moving = d.id);
    try {
      await moveDeal(d.id, to.id);
      ref.invalidate(dealBoardProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            behavior: SnackBarBehavior.floating,
            content: Text('Moved to ${to.name}')));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            behavior: SnackBarBehavior.floating,
            content: Text('Could not move the deal')));
      }
    } finally {
      if (mounted) setState(() => _moving = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final board = ref.watch(dealBoardProvider);
    final canWrite = ref.watch(authProvider).workspace?.role != 'viewer';
    return Scaffold(
      appBar: AppBar(
        title: const Text('Deals'),
        leading: IconButton(
            icon: const Icon(Icons.chevron_left, size: 28),
            onPressed: () => context.pop()),
      ),
      body: board.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => EmptyState('Could not load deals', hint: '$e'),
        data: (b) {
          if (b.stages.isEmpty) {
            return const EmptyState('No pipeline yet',
                hint: 'Create your pipeline on the web, then deals show up here.');
          }
          final index = _index.clamp(0, b.stages.length - 1);
          final byStage = {
            for (final s in b.stages)
              s.id: b.deals.where((d) => d.stageId == s.id).toList(),
          };
          final total = b.deals.fold<num>(0, (a, d) => a + d.value);

          return Column(children: [
            _Summary(
                total: _compact.format(total), count: b.deals.length),
            SizedBox(
              height: 46,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: b.stages.length,
                separatorBuilder: (_, _) => const SizedBox(width: 8),
                itemBuilder: (_, i) {
                  final s = b.stages[i];
                  return _StageTab(
                    key: _tabKeys.putIfAbsent(i, GlobalKey.new),
                    name: s.name,
                    count: byStage[s.id]!.length,
                    color: stageColor(s, i),
                    selected: i == index,
                    onTap: () => _goTo(i),
                  );
                },
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _page,
                onPageChanged: _onPage,
                itemCount: b.stages.length,
                itemBuilder: (_, i) {
                  final stage = b.stages[i];
                  final deals = byStage[stage.id]!;
                  final color = stageColor(stage, i);
                  final stageTotal = deals.fold<num>(0, (a, d) => a + d.value);
                  return _StageColumn(
                    stage: stage,
                    color: color,
                    step: i + 1,
                    steps: b.stages.length,
                    total: _compact.format(stageTotal),
                    onRefresh: () => ref.refresh(dealBoardProvider.future),
                    deals: [
                      for (final d in deals)
                        _DealCard(
                          deal: d,
                          value: _fmt(d),
                          color: color,
                          busy: _moving == d.id,
                          prev: canWrite && i > 0 ? b.stages[i - 1] : null,
                          next: canWrite && i < b.stages.length - 1
                              ? b.stages[i + 1]
                              : null,
                          onMove: (to) => _move(d, to),
                        ),
                    ],
                  );
                },
              ),
            ),
          ]);
        },
      ),
    );
  }
}

/// Every stage uses the brand accent: one colour reads calmer than a hue per
/// stage. Kept as a function so a per-stage colour is a one-line change.
Color stageColor(Stage s, int i) => C.accent;

class _Summary extends StatelessWidget {
  const _Summary({required this.total, required this.count});
  final String total;
  final int count;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          gradient: kBrandGradient,
          boxShadow: [
            BoxShadow(
                color: C.accent.withValues(alpha: 0.25),
                blurRadius: 16,
                offset: const Offset(0, 6)),
          ],
        ),
        child: Row(children: [
          Expanded(
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: 2,
                children: [
                  Text('Pipeline value',
                      style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.8),
                          fontSize: 12.5,
                          fontWeight: FontWeight.w500)),
                  Text(total,
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 26,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.5)),
                ]),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(12)),
            child: Row(mainAxisSize: MainAxisSize.min, spacing: 6, children: [
              const Icon(Icons.handshake_outlined,
                  color: Colors.white, size: 18),
              Text('$count ${count == 1 ? 'deal' : 'deals'}',
                  style: const TextStyle(
                      color: Colors.white, fontWeight: FontWeight.w600)),
            ]),
          ),
        ]),
      );
}

class _StageTab extends StatelessWidget {
  const _StageTab({
    super.key,
    required this.name,
    required this.count,
    required this.color,
    required this.selected,
    required this.onTap,
  });
  final String name;
  final int count;
  final Color color;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Center(
        child: Material(
          color: selected ? C.fg : C.surface,
          shape: StadiumBorder(
              side: BorderSide(color: selected ? C.fg : C.line)),
          child: InkWell(
            customBorder: const StadiumBorder(),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
              child: Row(mainAxisSize: MainAxisSize.min, spacing: 8, children: [
                Container(
                    width: 8,
                    height: 8,
                    decoration:
                        BoxDecoration(color: color, shape: BoxShape.circle)),
                Text(name,
                    style: TextStyle(
                        color: selected ? Colors.white : C.fg,
                        fontWeight: FontWeight.w600,
                        fontSize: 13)),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                  decoration: BoxDecoration(
                      color: selected
                          ? Colors.white.withValues(alpha: 0.2)
                          : C.surface2,
                      borderRadius: BorderRadius.circular(99)),
                  child: Text('$count',
                      style: TextStyle(
                          color: selected ? Colors.white : C.muted,
                          fontSize: 11.5,
                          fontWeight: FontWeight.w600)),
                ),
              ]),
            ),
          ),
        ),
      );
}

class _StageColumn extends StatelessWidget {
  const _StageColumn({
    required this.stage,
    required this.color,
    required this.step,
    required this.steps,
    required this.total,
    required this.deals,
    required this.onRefresh,
  });
  final Stage stage;
  final Color color;
  final int step;
  final int steps;
  final String total;
  final List<Widget> deals;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.fromLTRB(5, 8, 5, 16),
        decoration: BoxDecoration(
            color: C.surface2, borderRadius: BorderRadius.circular(20)),
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 10),
            child: Column(spacing: 10, children: [
              Row(children: [
                Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      spacing: 2,
                      children: [
                        Text(stage.name,
                            style: const TextStyle(
                                fontSize: 17, fontWeight: FontWeight.w700)),
                        Text('Stage $step of $steps',
                            style: const TextStyle(
                                color: C.muted, fontSize: 12)),
                      ]),
                ),
                Text(total,
                    style: TextStyle(
                        color: color,
                        fontSize: 17,
                        fontWeight: FontWeight.w800)),
              ]),
              ClipRRect(
                borderRadius: BorderRadius.circular(99),
                child: LinearProgressIndicator(
                  value: step / steps,
                  minHeight: 5,
                  color: color,
                  backgroundColor: color.withValues(alpha: 0.15),
                ),
              ),
            ]),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: onRefresh,
              child: deals.isEmpty
                  ? ListView(children: [
                      const SizedBox(height: 60),
                      Icon(Icons.inbox_outlined,
                          size: 44, color: C.muted.withValues(alpha: 0.5)),
                      const SizedBox(height: 10),
                      const Text('No deals in this stage',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              color: C.muted, fontWeight: FontWeight.w500)),
                    ])
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(12, 2, 12, 16),
                      itemCount: deals.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 10),
                      itemBuilder: (_, j) => deals[j],
                    ),
            ),
          ),
        ]),
      );
}

class _DealCard extends StatelessWidget {
  const _DealCard({
    required this.deal,
    required this.value,
    required this.color,
    required this.busy,
    required this.prev,
    required this.next,
    required this.onMove,
  });
  final Deal deal;
  final String value;
  final Color color;
  final bool busy;
  final Stage? prev;
  final Stage? next;
  final ValueChanged<Stage> onMove;

  @override
  Widget build(BuildContext context) {
    final who = deal.contactName;
    return Container(
      decoration: BoxDecoration(
        color: C.surface,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.05),
              blurRadius: 10,
              offset: const Offset(0, 3)),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: IntrinsicHeight(
        child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Container(width: 4, color: color),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: 10,
                  children: [
                    Row(crossAxisAlignment: CrossAxisAlignment.start, spacing: 12, children: [
                      _Initials(who ?? deal.title, color: color),
                      Expanded(
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            spacing: 3,
                            children: [
                              Text(deal.title,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                      fontSize: 15,
                                      height: 1.25,
                                      fontWeight: FontWeight.w700)),
                              if (who != null)
                                Row(spacing: 4, children: [
                                  const Icon(Icons.person_outline,
                                      size: 14, color: C.muted),
                                  Flexible(
                                    child: Text(who,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                            color: C.muted, fontSize: 12.5)),
                                  ),
                                ]),
                            ]),
                      ),
                    ]),
                    Text(value,
                        style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.3)),
                    if (prev != null || next != null) ...[
                      const Divider(height: 1),
                      busy
                          ? const SizedBox(
                              height: kHit,
                              child: Center(
                                  child: SizedBox(
                                      width: 18,
                                      height: 18,
                                      child: CircularProgressIndicator(
                                          strokeWidth: 2))))
                          : Row(spacing: 8, children: [
                              if (prev != null)
                                Expanded(
                                  child: _MoveButton(
                                      label: prev!.name,
                                      back: true,
                                      onTap: () => onMove(prev!)),
                                ),
                              if (next != null)
                                Expanded(
                                  child: _MoveButton(
                                      label: next!.name,
                                      back: false,
                                      primary: true,
                                      color: color,
                                      onTap: () => onMove(next!)),
                                ),
                            ]),
                    ],
                  ]),
            ),
          ),
        ]),
      ),
    );
  }
}

class _Initials extends StatelessWidget {
  const _Initials(this.name, {required this.color});
  final String name;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
        width: 40,
        height: 40,
        alignment: Alignment.center,
        decoration: BoxDecoration(
            color: color.withValues(alpha: 0.12), shape: BoxShape.circle),
        child: Text(initials(name),
            style: TextStyle(
                color: color, fontWeight: FontWeight.w700, fontSize: 14)),
      );
}

class _MoveButton extends StatelessWidget {
  const _MoveButton({
    required this.label,
    required this.back,
    required this.onTap,
    this.primary = false,
    this.color = C.accent,
  });
  final String label;
  final bool back;
  final bool primary;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final fg = primary ? color : C.muted;
    final text = Flexible(
        child: Text(label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
                color: fg, fontWeight: FontWeight.w600, fontSize: 12.5)));
    final icon =
        Icon(back ? Icons.arrow_back : Icons.arrow_forward, size: 16, color: fg);
    return Material(
      color: primary ? color.withValues(alpha: 0.1) : C.surface2,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: kHit),
          padding: const EdgeInsets.symmetric(horizontal: 10),
          child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              spacing: 6,
              children: back ? [icon, text] : [text, icon]),
        ),
      ),
    );
  }
}
