import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/models.dart';
import '../core/theme.dart';
import '../state/auth.dart';
import '../ui/widgets.dart';

/// Standing is colour AND text (spec section 4). `grace` is dunning and still
/// entitled, so it is never painted like `lapsed`.
(String, PillTone) standingLabel(Workspace w) {
  if (w.standing == 'lapsed') return ('Plan lapsed', PillTone.bad);
  if (w.standing == 'grace') return ('Payment late, still working', PillTone.warn);
  if (w.subscriptionStatus == 'trial') return ('Trial', PillTone.warn);
  return ('Active', PillTone.ok);
}

class SelectWorkspaceScreen extends ConsumerStatefulWidget {
  const SelectWorkspaceScreen({super.key});
  @override
  ConsumerState<SelectWorkspaceScreen> createState() => _State();
}

class _State extends ConsumerState<SelectWorkspaceScreen> {
  String? _busy;
  String? _error;

  Future<void> _pick(String id) async {
    setState(() {
      _busy = id;
      _error = null;
    });
    try {
      await ref.read(authProvider.notifier).selectWorkspace(id);
      if (mounted) context.go('/inbox');
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final a = ref.watch(authProvider);
    final none = a.status == AuthStatus.noWorkspace;
    return Scaffold(
      appBar: context.canPop() ? AppBar() : null,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(22),
          children: [
            if (none) ...[
              const SizedBox(height: 40),
              const Text('No workspace yet',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
              const SizedBox(height: 10),
              const Text(
                'You are not a member of any workspace. Ask the owner for an invitation link, then open it on this phone.',
                style: TextStyle(color: C.muted),
              ),
            ] else ...[
              const Text('Choose a workspace',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
              Text('You belong to ${a.workspaces.length}. You can switch any time.',
                  style: const TextStyle(color: C.muted)),
            ],
            const SizedBox(height: 14),
            ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: Container(
                decoration: BoxDecoration(
                    border: Border.all(color: C.line),
                    borderRadius: BorderRadius.circular(14)),
                child: Column(children: [
                  for (final w in a.workspaces)
                    Builder(builder: (_) {
                      final (text, tone) = standingLabel(w);
                      return InkWell(
                        onTap: _busy == null ? () => _pick(w.id) : null,
                        child: Opacity(
                          opacity: _busy != null && _busy != w.id ? 0.5 : 1,
                          child: Container(
                            constraints: const BoxConstraints(minHeight: kHit),
                            padding: const EdgeInsets.all(14),
                            decoration: const BoxDecoration(
                                color: C.surface,
                                border: Border(bottom: BorderSide(color: C.line))),
                            child: Row(spacing: 10, children: [
                              AppAvatar(w.name),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(w.name,
                                        style: const TextStyle(
                                            fontWeight: FontWeight.w600)),
                                    Text('${w.planName ?? 'No plan'} · ${w.role}',
                                        style: const TextStyle(
                                            color: C.muted, fontSize: 12.5)),
                                  ],
                                ),
                              ),
                              Pill(text, tone: tone),
                            ]),
                          ),
                        ),
                      );
                    }),
                ]),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!, style: const TextStyle(color: C.bad)),
            ],
            const SizedBox(height: 14),
            AppButton('Sign out',
                onPressed: ref.read(authProvider.notifier).signOut),
          ],
        ),
      ),
    );
  }
}
