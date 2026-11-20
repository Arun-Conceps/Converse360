import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/config.dart';
import '../core/inbox_logic.dart';
import '../core/theme.dart';
import '../state/app_lock.dart';
import '../state/auth.dart';
import '../ui/widgets.dart';

/// More: a workspace header, then the menu grouped by what each item is for.
/// One accent colour throughout; only Sign out is red, because it is the one
/// row that takes you out of the app.
class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final a = ref.watch(authProvider);
    final w = a.workspace;
    final lockOn = ref.watch(appLockProvider).enabled;

    Future<void> toggleLock(bool on) async {
      final ok = await ref.read(appLockProvider.notifier).setEnabled(on);
      if (!ok && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            behavior: SnackBarBehavior.floating,
            content: Text(
              on
                  ? 'Set up a fingerprint or screen lock on this phone first.'
                  : 'Could not confirm it is you.',
            ),
          ),
        );
      }
    }

    return Scaffold(
      appBar: AppBar(title: const Text('More')),
      // Bottom inset = the floating nav bar, which the page scrolls behind.
      body: MaxWidth(
        child: ListView(
          padding: EdgeInsets.fromLTRB(
            16,
            8,
            16,
            24 + MediaQuery.paddingOf(context).bottom,
          ),
          children: [
            _Header(
              name: w?.name ?? '',
              email: a.email,
              role: w?.role ?? '',
              canSwitch: a.workspaces.length > 1,
              onTap: () => context.push('/select-workspace'),
            ),
            const _SectionTitle('Sales & CRM'),
            _Group(
              children: [
                _Row(
                  icon: Icons.view_kanban_outlined,
                  title: 'Deals',
                  subtitle: 'Pipeline board',
                  onTap: () => context.push('/deals'),
                ),
                _Row(
                  icon: Icons.groups_2_outlined,
                  title: 'Segments',
                  subtitle: 'Named audiences',
                  onTap: () => context.push('/tools?tab=0'),
                ),
              ],
            ),
            const _SectionTitle('Messaging'),
            _Group(
              children: [
                _Row(
                  icon: Icons.notifications_none,
                  title: 'Notifications',
                  subtitle: 'Assignments and @mentions',
                  onTap: () => context.push('/notifications'),
                ),
                _Row(
                  icon: Icons.bolt_outlined,
                  title: 'Quick replies',
                  subtitle: 'Saved replies for the / shortcut',
                  onTap: () => context.push('/quick-replies'),
                ),
              ],
            ),
            const _SectionTitle('Automation & AI'),
            _Group(
              children: [
                _Row(
                  icon: Icons.account_tree_outlined,
                  title: 'Automations & flows',
                  subtitle: 'What is running, and how often',
                  onTap: () => context.push('/tools?tab=1'),
                ),
                _Row(
                  icon: Icons.smart_toy_outlined,
                  title: 'AI agents',
                  subtitle: 'Status, mode and channels',
                  onTap: () => context.push('/tools?tab=3'),
                ),
              ],
            ),
            const _SectionTitle('Security'),
            _Group(
              children: [
                _Row(
                  icon: Icons.fingerprint,
                  title: 'App lock',
                  subtitle: lockOn
                      ? 'On: fingerprint, face or screen lock'
                      : 'Off: ask for fingerprint, face or screen lock',
                  onTap: () => toggleLock(!lockOn),
                  trailing: Switch(
                    value: lockOn,
                    activeThumbColor: Colors.white,
                    activeTrackColor: C.accent,
                    onChanged: toggleLock,
                  ),
                ),
              ],
            ),
            const _SectionTitle('Account'),
            _Group(
              children: [
                _Row(
                  icon: Icons.qr_code_scanner,
                  title: 'Scan QR to sign in on web',
                  subtitle: 'Log the web dashboard in as this account',
                  onTap: () => context.push('/scan-qr'),
                ),
                _Row(
                  icon: Icons.open_in_new,
                  title: 'Open the web dashboard',
                  subtitle: 'Full settings, billing and reports',
                  onTap: () => launchUrl(
                    Uri.parse(Config.webUrl),
                    mode: LaunchMode.externalApplication,
                  ),
                ),
                _Row(
                  icon: Icons.logout,
                  title: 'Sign out',
                  subtitle: a.email ?? 'Sign out of this phone',
                  danger: true,
                  onTap: () => _confirmSignOut(context, ref),
                ),
              ],
            ),
            const SizedBox(height: 20),
            const Center(
              child: Text(
                'Converse360 · version 0.1.0',
                style: TextStyle(color: C.muted, fontSize: 12),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _confirmSignOut(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text(
          'You will need your email and password to sign in again.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: C.bad),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
    if (ok == true) await ref.read(authProvider.notifier).signOut();
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.name,
    required this.email,
    required this.role,
    required this.canSwitch,
    required this.onTap,
  });
  final String name;
  final String? email;
  final String role;
  final bool canSwitch;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final roleLabel = role.isEmpty
        ? ''
        : '${role[0].toUpperCase()}${role.substring(1)}';
    return Container(
      decoration: BoxDecoration(
        gradient: kBrandGradient,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: C.accent.withValues(alpha: 0.25),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          borderRadius: BorderRadius.circular(20),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Row(
              spacing: 14,
              children: [
                Container(
                  width: 54,
                  height: 54,
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(
                    color: Colors.white,
                    shape: BoxShape.circle,
                  ),
                  child: Text(
                    initials(name.isEmpty ? '?' : name),
                    style: const TextStyle(
                      color: C.accent,
                      fontSize: 19,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    spacing: 3,
                    children: [
                      Text(
                        'Workspace',
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.75),
                          fontSize: 11.5,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 0.4,
                        ),
                      ),
                      Text(
                        name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 17,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      if (email != null && email != name)
                        Text(
                          email!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.85),
                            fontSize: 12.5,
                          ),
                        ),
                      if (roleLabel.isNotEmpty)
                        Container(
                          margin: const EdgeInsets.only(top: 4),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 9,
                            vertical: 3,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.2),
                            borderRadius: BorderRadius.circular(99),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            spacing: 4,
                            children: [
                              const Icon(
                                Icons.verified_user_outlined,
                                size: 13,
                                color: Colors.white,
                              ),
                              Text(
                                roleLabel,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
                if (canSwitch)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 7,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(99),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      spacing: 4,
                      children: [
                        Icon(Icons.swap_horiz, size: 16, color: C.accent),
                        Text(
                          'Switch',
                          style: TextStyle(
                            color: C.accent,
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(6, 22, 6, 8),
    child: Text(
      text.toUpperCase(),
      style: const TextStyle(
        color: C.muted,
        fontSize: 11.5,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.8,
      ),
    ),
  );
}

/// A white rounded card holding rows, with inset dividers between them.
class _Group extends StatelessWidget {
  const _Group({required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(
      color: C.surface,
      borderRadius: BorderRadius.circular(18),
      boxShadow: [
        BoxShadow(
          color: Colors.black.withValues(alpha: 0.04),
          blurRadius: 10,
          offset: const Offset(0, 3),
        ),
      ],
    ),
    clipBehavior: Clip.antiAlias,
    child: Column(
      children: [
        for (var i = 0; i < children.length; i++) ...[
          if (i > 0) const Divider(height: 1, indent: 70),
          children[i],
        ],
      ],
    ),
  );
}

class _Row extends StatelessWidget {
  const _Row({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.trailing,
    this.danger = false,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final Widget? trailing;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final fg = danger ? C.bad : C.accent;
    final bg = danger ? C.badSoft : C.accentSoft;
    return Material(
      color: C.surface,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
          child: Row(
            spacing: 14,
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: bg,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: fg, size: 22),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: 2,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: danger ? C.bad : C.fg,
                      ),
                    ),
                    Text(
                      subtitle,
                      style: const TextStyle(color: C.muted, fontSize: 12.5),
                    ),
                  ],
                ),
              ),
              trailing ??
                  const Icon(Icons.chevron_right, color: C.muted, size: 22),
            ],
          ),
        ),
      ),
    );
  }
}
