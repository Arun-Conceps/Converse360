import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/theme.dart';
import '../state/app_lock.dart';
import '../ui/brand.dart';
import '../ui/widgets.dart';

/// Wraps the whole app. While locked, the app UI is not even built underneath,
/// so a screenshot or the task switcher shows only this.
class LockGate extends ConsumerStatefulWidget {
  const LockGate({super.key, required this.child});
  final Widget child;
  @override
  ConsumerState<LockGate> createState() => _LockGateState();
}

class _LockGateState extends ConsumerState<LockGate> with WidgetsBindingObserver {
  bool _prompting = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState s) {
    final lock = ref.read(appLockProvider.notifier);
    if (s == AppLifecycleState.paused) lock.wentToBackground();
    if (s == AppLifecycleState.resumed) {
      lock.cameToForeground();
      if (ref.read(appLockProvider).locked) _unlock();
    }
  }

  Future<void> _unlock() async {
    if (_prompting) return;
    _prompting = true;
    await ref.read(appLockProvider.notifier).unlock();
    _prompting = false;
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(appLockProvider);
    if (!s.loaded) return const ColoredBox(color: Colors.white);
    if (!s.locked) return widget.child;
    WidgetsBinding.instance.addPostFrameCallback((_) => _unlock());
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Center(
          child: Column(mainAxisSize: MainAxisSize.min, spacing: 20, children: [
            const BrandWordmark(width: 220),
            const Icon(Icons.lock_outline, size: 34, color: C.muted),
            const Text('Converse360 is locked',
                style: TextStyle(fontWeight: FontWeight.w600)),
            SizedBox(
              width: 220,
              child: AppButton('Unlock', primary: true, onPressed: _unlock),
            ),
          ]),
        ),
      ),
    );
  }
}
