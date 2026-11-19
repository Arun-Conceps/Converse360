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

/// One status chip for every list (broadcasts, templates, flows...). Single
/// brand colour, told apart by FILL and ICON rather than by hue:
///   done (sent / approved / active)        filled green, check
///   in progress (scheduled / pending ...)  green outline, clock
///   draft / unknown                        grey
///   failed / rejected                      red — the one exception, because
///                                          it needs someone to act on it.
class StatusChip extends StatelessWidget {
  const StatusChip(this.status, {super.key});
  final String status;

  @override
  Widget build(BuildContext context) {
    final s = status.toLowerCase();
    final (IconData icon, Color fg, Color bg, Color? border) = switch (s) {
      'sent' || 'approved' || 'active' || 'published' || 'delivered' =>
        (Icons.check_circle, Colors.white, C.accent, null),
      'scheduled' || 'pending' || 'queued' || 'sending' || 'in_review' =>
        (Icons.schedule, C.accent, C.surface, C.accent),
      'failed' || 'rejected' || 'error' =>
        (Icons.error_outline, C.bad, C.badSoft, null),
      _ => (Icons.edit_note, C.muted, C.surface2, null),
    };
    final label = s.isEmpty ? '' : '${s[0].toUpperCase()}${s.substring(1).replaceAll('_', ' ')}';
    return Container(
      padding: const EdgeInsets.fromLTRB(7, 3, 9, 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(99),
        border: border == null ? null : Border.all(color: border),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, spacing: 4, children: [
        Icon(icon, size: 13, color: fg),
        Text(label,
            style: TextStyle(
                color: fg, fontSize: 11.5, fontWeight: FontWeight.w700)),
      ]),
    );
  }
}

/// Uppercase grey heading above a group, e.g. "NEEDS ATTENTION".
class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key, this.trailing});
  final String text;
  final Widget? trailing;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 22, 4, 10),
        child: Row(children: [
          Expanded(
            child: Text(text.toUpperCase(),
                style: const TextStyle(
                    color: C.muted,
                    fontSize: 11.5,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.8)),
          ),
          ?trailing,
        ]),
      );
}

/// White rounded card with a soft shadow — the surface every list sits on.
BoxDecoration cardDecoration({double radius = 16}) => BoxDecoration(
      color: C.surface,
      borderRadius: BorderRadius.circular(radius),
      boxShadow: [
        BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 10,
            offset: const Offset(0, 3)),
      ],
    );

/// Round tinted icon tile used at the start of list rows.
class IconTile extends StatelessWidget {
  const IconTile(this.icon, {super.key, this.size = 42, this.filled = false});
  final IconData icon;
  final double size;
  final bool filled;
  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
            color: filled ? C.accent : C.accentSoft,
            borderRadius: BorderRadius.circular(size * 0.29)),
        child: Icon(icon,
            size: size * 0.52, color: filled ? Colors.white : C.accent),
      );
}

/// THE way to open a bottom sheet from a tab screen.
/// - useRootNavigator: a tab's own navigator sits under the floating nav bar,
///   so a sheet opened there is drawn BEHIND it.
/// - Scrolls, capped at 85% of the screen: content taller than the default
///   9/16 cap otherwise overflows (the yellow-black stripe).
/// - Never wider than [kMaxContentWidth] on a tablet or landscape.
Future<T?> showAppSheet<T>(BuildContext context,
        {required WidgetBuilder builder}) =>
    showModalBottomSheet<T>(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: C.surface,
      constraints: BoxConstraints(
        maxWidth: kMaxContentWidth,
        maxHeight: MediaQuery.sizeOf(context).height * 0.85,
      ),
      builder: (ctx) => SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: builder(ctx),
        ),
      ),
    );

/// Content never stretches past this on tablets / landscape; it centres.
const double kMaxContentWidth = 640;

/// Centres [child] and caps its width at [kMaxContentWidth]. On a phone it
/// does nothing; on a tablet it keeps lines and cards a readable size.
class MaxWidth extends StatelessWidget {
  const MaxWidth({super.key, required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: kMaxContentWidth),
          child: child,
        ),
      );
}

/// Lays children out in [columns] equal columns, dropping to one column when
/// each would be narrower than [minItemWidth] (small phones, large text).
class ResponsiveGrid extends StatelessWidget {
  const ResponsiveGrid({
    super.key,
    required this.children,
    this.columns = 2,
    this.minItemWidth = 140,
    this.spacing = 10,
  });
  final List<Widget> children;
  final int columns;
  final double minItemWidth;
  final double spacing;

  @override
  Widget build(BuildContext context) => LayoutBuilder(builder: (_, c) {
        var cols = columns;
        while (cols > 1 &&
            (c.maxWidth - spacing * (cols - 1)) / cols < minItemWidth) {
          cols--;
        }
        final w = (c.maxWidth - spacing * (cols - 1)) / cols;
        return Wrap(
          spacing: spacing,
          runSpacing: spacing,
          children: [for (final ch in children) SizedBox(width: w, child: ch)],
        );
      });
}
