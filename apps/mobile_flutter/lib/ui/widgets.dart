import 'package:flutter/material.dart';

import '../core/inbox_logic.dart';
import '../core/theme.dart';

class AppAvatar extends StatelessWidget {
  const AppAvatar(this.name, {super.key, this.size = 42});
  final String name;
  final double size;
  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration:
            const BoxDecoration(color: C.accentSoft, shape: BoxShape.circle),
        child: Text(initials(name),
            style: TextStyle(
                color: C.accent,
                fontWeight: FontWeight.w600,
                fontSize: size * 0.33)),
      );
}

enum PillTone { plain, ok, warn, bad }

class Pill extends StatelessWidget {
  const Pill(this.text, {super.key, this.tone = PillTone.plain});
  final String text;
  final PillTone tone;
  @override
  Widget build(BuildContext context) {
    final (bg, fg) = switch (tone) {
      PillTone.plain => (C.surface2, C.muted),
      PillTone.ok => (C.accentSoft, C.accent),
      PillTone.warn => (C.warnSoft, C.warn),
      PillTone.bad => (C.badSoft, C.bad),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 1),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
      child: Text(text,
          style: TextStyle(color: fg, fontSize: 11, fontWeight: FontWeight.w500)),
    );
  }
}

class AppButton extends StatelessWidget {
  const AppButton(this.label,
      {super.key,
      required this.onPressed,
      this.primary = false,
      this.danger = false,
      this.loading = false});
  final String label;
  final VoidCallback? onPressed;
  final bool primary;
  final bool danger;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final child = loading
        ? const SizedBox(
            width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
        : Text(label, style: const TextStyle(fontWeight: FontWeight.w600));
    final enabled = onPressed != null && !loading;
    final shape =
        RoundedRectangleBorder(borderRadius: BorderRadius.circular(10));
    const size = Size.fromHeight(kHit);
    return primary
        ? FilledButton(
            onPressed: enabled ? onPressed : null,
            style: FilledButton.styleFrom(
                minimumSize: size, shape: shape, backgroundColor: C.accent),
            child: child)
        : OutlinedButton(
            onPressed: enabled ? onPressed : null,
            style: OutlinedButton.styleFrom(
                minimumSize: size,
                shape: shape,
                backgroundColor: C.surface,
                foregroundColor: danger ? C.bad : C.fg,
                side: const BorderSide(color: C.line)),
            child: child);
  }
}

class BannerStrip extends StatelessWidget {
  const BannerStrip(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        color: C.warnSoft,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        child: Text(text, style: const TextStyle(color: C.warn, fontSize: 12.5)),
      );
}

class EmptyState extends StatelessWidget {
  const EmptyState(this.title, {super.key, this.hint});
  final String title;
  final String? hint;
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(30),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
            if (hint != null) ...[
              const SizedBox(height: 6),
              Text(hint!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: C.muted)),
            ],
          ]),
        ),
      );
}

/// Centered column used by the full-screen states (error, lapsed, splash).
class CenteredPage extends StatelessWidget {
  const CenteredPage({super.key, required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  spacing: 12,
                  children: children),
            ),
          ),
        ),
      );
}

class SearchField extends StatelessWidget {
  const SearchField(
      {super.key, required this.hint, required this.onChanged});
  final String hint;
  final ValueChanged<String> onChanged;
  @override
  Widget build(BuildContext context) => Container(
        color: C.surface,
        padding: const EdgeInsets.all(10),
        child: TextField(
          onChanged: onChanged,
          decoration: InputDecoration(
              hintText: hint,
              isDense: true,
              prefixIcon: const Icon(Icons.search, size: 20)),
        ),
      );
}
