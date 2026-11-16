import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../core/models_more.dart';
import '../core/theme.dart';
import '../state/auth.dart';
import '../state/data_more.dart';
import '../ui/widgets.dart';

/// Deals board: one swipeable column per stage, move with the arrows (spec 3.9).
class DealsScreen extends ConsumerStatefulWidget {
  const DealsScreen({super.key});
  @override
  ConsumerState<DealsScreen> createState() => _DealsScreenState();
}

class _DealsScreenState extends ConsumerState<DealsScreen> {
  final _page = PageController(viewportFraction: 0.86);
  String? _moving;

  @override
  void dispose() {
    _page.dispose();
    super.dispose();
  }

  Future<void> _move(Deal d, Stage to) async {
    setState(() => _moving = d.id);
    try {
      await moveDeal(d.id, to.id);
      ref.invalidate(dealBoardProvider);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Could not move the deal')));
      }
    } finally {
      if (mounted) setState(() => _moving = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final board = ref.watch(dealBoardProvider);
    final canWrite = ref.watch(authProvider).workspace?.role != 'viewer';
    final money = NumberFormat.decimalPattern('en_IN');
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
          return PageView.builder(
            controller: _page,
            itemCount: b.stages.length,
            itemBuilder: (_, i) {
              final stage = b.stages[i];
              final deals = b.deals.where((d) => d.stageId == stage.id).toList();
              return Container(
                margin: const EdgeInsets.fromLTRB(6, 12, 6, 12),
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                    color: C.surface2, borderRadius: BorderRadius.circular(14)),
                child: Column(children: [
                  Padding(
                    padding: const EdgeInsets.all(4),
                    child: Row(children: [
                      Expanded(
                          child: Text(stage.name,
                              style: const TextStyle(fontWeight: FontWeight.w700))),
                      Pill('${deals.length}'),
                    ]),
                  ),
                  Expanded(
                    child: deals.isEmpty
                        ? const Center(
                            child: Text('Empty', style: TextStyle(color: C.muted)))
                        : ListView.separated(
                            itemCount: deals.length,
                            separatorBuilder: (_, _) => const SizedBox(height: 8),
                            itemBuilder: (_, j) {
                              final d = deals[j];
                              return Container(
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(
                                    color: C.surface,
                                    border: Border.all(color: C.line),
                                    borderRadius: BorderRadius.circular(12)),
                                child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    spacing: 4,
                                    children: [
                                      Text(d.title,
                                          style: const TextStyle(fontWeight: FontWeight.w600)),
                                      if (d.contactName != null)
                                        Text(d.contactName!,
                                            style: const TextStyle(
                                                color: C.muted, fontSize: 12.5)),
                                      Text('${d.currency == 'USD' ? r'$' : '₹'}${money.format(d.value)}',
                                          style: const TextStyle(
                                              fontSize: 16, fontWeight: FontWeight.w600)),
                                      if (canWrite)
                                        Row(children: [
                                          IconButton(
                                            tooltip: 'Move to previous stage',
                                            onPressed: i == 0 || _moving == d.id
                                                ? null
                                                : () => _move(d, b.stages[i - 1]),
                                            icon: const Icon(Icons.arrow_back),
                                          ),
                                          IconButton(
                                            tooltip: 'Move to next stage',
                                            onPressed: i == b.stages.length - 1 || _moving == d.id
                                                ? null
                                                : () => _move(d, b.stages[i + 1]),
                                            icon: const Icon(Icons.arrow_forward),
                                          ),
                                        ]),
                                    ]),
                              );
                            },
                          ),
                  ),
                ]),
              );
            },
          );
        },
      ),
    );
  }
}
