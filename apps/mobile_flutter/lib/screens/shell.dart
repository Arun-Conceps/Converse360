import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/theme.dart';
import '../state/data.dart';

class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(conversationsProvider).value
            ?.fold<int>(0, (a, c) => a + c.unreadCount) ??
        0;
    // extendBody: pages scroll BEHIND the floating bar, so there is no grey
    // band around it. Scaffold then reports the bar's height as the body's
    // bottom padding, which lists add to their own (see Home / More).
    return Scaffold(
      extendBody: true,
      body: shell,
      bottomNavigationBar: FloatingNavBar(
        index: shell.currentIndex,
        onTap: (i) => shell.goBranch(i, initialLocation: i == shell.currentIndex),
        items: [
          const NavItem(Icons.home_outlined, Icons.home_rounded, 'Home'),
          NavItem(Icons.chat_bubble_outline, Icons.chat_bubble_rounded, 'Inbox',
              badge: unread),
          const NavItem(Icons.people_outline, Icons.people_rounded, 'Contacts'),
          const NavItem(Icons.campaign_outlined, Icons.campaign_rounded, 'Send'),
          const NavItem(Icons.grid_view_outlined, Icons.grid_view_rounded, 'More'),
        ],
      ),
    );
  }
}

class NavItem {
  const NavItem(this.icon, this.selectedIcon, this.label, {this.badge = 0});
  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final int badge;
}

/// A white bar floating above the page with rounded ends. The selected tab
/// rises out of it as a green circle; the others stay grey and flat.
class FloatingNavBar extends StatelessWidget {
  const FloatingNavBar(
      {super.key, required this.index, required this.onTap, required this.items});
  final int index;
  final ValueChanged<int> onTap;
  final List<NavItem> items;

  static const _barHeight = 66.0;
  static const _lift = 24.0; // how far the selected circle rises above the bar
  static const _circle = 50.0;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(14, 0, 14, bottomGap(context)),
      child: SizedBox(
        height: _barHeight + _lift,
        child: Stack(clipBehavior: Clip.none, children: [
          Positioned.fill(
            top: _lift,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(26),
                boxShadow: [
                  BoxShadow(
                      color: Colors.black.withValues(alpha: 0.10),
                      blurRadius: 24,
                      offset: const Offset(0, 8)),
                ],
              ),
            ),
          ),
          Positioned.fill(
            child: Row(children: [
              for (var i = 0; i < items.length; i++)
                Expanded(
                  child: _Tab(
                    item: items[i],
                    selected: i == index,
                    onTap: () => onTap(i),
                  ),
                ),
            ]),
          ),
        ]),
      ),
    );
  }
}

/// Space under the floating bar, by how the phone is navigated:
/// - Gesture navigation: the system inset is only the thin home-handle strip
///   (about 16–24dp). No safe area — the bar sits near the bottom edge.
/// - 3-button navigation: the inset is the full button row (about 48dp). Keep
///   it, or the Back / Home buttons would sit on top of the bar.
/// Flutter exposes no "navigation mode" flag, so the inset's size is the
/// signal; 32dp separates the two on every Android version we target.
double bottomGap(BuildContext context) {
  final inset = MediaQuery.viewPaddingOf(context).bottom;
  const gestureOnly = 32.0;
  if (inset <= gestureOnly) return 8; // gesture nav, or no system bar at all
  return inset + 6; // button nav: clear the buttons
}

class _Tab extends StatelessWidget {
  const _Tab({required this.item, required this.selected, required this.onTap});
  final NavItem item;
  final bool selected;
  final VoidCallback onTap;

  static const _dur = Duration(milliseconds: 260);

  @override
  Widget build(BuildContext context) {
    const lift = FloatingNavBar._lift;
    const size = FloatingNavBar._circle;
    return Semantics(
      button: true,
      selected: selected,
      label: item.badge > 0 ? '${item.label}, ${item.badge} unread' : item.label,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: ExcludeSemantics(
          child: Stack(alignment: Alignment.topCenter, clipBehavior: Clip.none, children: [
            // Icon: a raised green circle when selected, a flat grey glyph otherwise.
            AnimatedPositioned(
              duration: _dur,
              curve: Curves.easeOutBack,
              top: selected ? 0 : lift + 10,
              child: AnimatedContainer(
                duration: _dur,
                curve: Curves.easeOut,
                width: selected ? size : 30,
                height: selected ? size : 30,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: selected ? C.accent : Colors.transparent,
                  boxShadow: selected
                      ? [
                          BoxShadow(
                              color: C.accent.withValues(alpha: 0.40),
                              blurRadius: 14,
                              offset: const Offset(0, 6)),
                        ]
                      : null,
                ),
                child: Center(
                  child: _WithBadge(
                    count: item.badge,
                    onGreen: selected,
                    child: Icon(selected ? item.selectedIcon : item.icon,
                        size: selected ? 24 : 23,
                        color: selected ? Colors.white : C.muted),
                  ),
                ),
              ),
            ),
            // Label sits at the bottom of the bar for every tab.
            Positioned(
              bottom: 9,
              child: AnimatedDefaultTextStyle(
                duration: _dur,
                style: TextStyle(
                  fontSize: 11.5,
                  fontWeight: selected ? FontWeight.w800 : FontWeight.w500,
                  color: selected ? C.accent : C.muted,
                ),
                child: Text(item.label),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

class _WithBadge extends StatelessWidget {
  const _WithBadge(
      {required this.count, required this.onGreen, required this.child});
  final int count;
  final bool onGreen;
  final Widget child;
  @override
  Widget build(BuildContext context) => Badge(
        isLabelVisible: count > 0,
        backgroundColor: onGreen ? Colors.white : C.accent,
        textColor: onGreen ? C.accent : Colors.white,
        label: Text(count > 99 ? '99+' : '$count',
            style: const TextStyle(fontWeight: FontWeight.w700)),
        child: child,
      );
}
