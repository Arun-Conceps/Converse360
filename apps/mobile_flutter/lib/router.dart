import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'screens/chat_screen.dart';
import 'screens/contact_screen.dart';
import 'screens/contacts_screen.dart';
import 'screens/deals_screen.dart';
import 'screens/notifications_screen.dart';
import 'screens/quick_replies_screen.dart';
import 'screens/home_screen.dart';
import 'screens/inbox_screen.dart';
import 'screens/more_screen.dart';
import 'screens/select_workspace_screen.dart';
import 'screens/send_screen.dart';
import 'screens/shell.dart';
import 'screens/new_broadcast_screen.dart';
import 'screens/scan_qr_screen.dart';
import 'screens/sign_in_screen.dart';
import 'screens/status_screens.dart';
import 'screens/workspace_tools_screen.dart';
import 'state/auth.dart';

/// The auth state machine decides where the user may be; screens never
/// navigate on auth changes themselves.
/// Keeps the branded splash up for a beat even when the session resolves
/// instantly (signed out = no network call), so it is seen rather than flashed.
final splashHoldProvider = FutureProvider<void>(
  (_) => Future<void>.delayed(const Duration(milliseconds: 1600)),
);

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier<int>(0);
  ref.listen(authProvider, (_, _) => refresh.value++);
  ref.listen(splashHoldProvider, (_, _) => refresh.value++);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: '/splash',
    refreshListenable: refresh,
    redirect: (context, state) {
      final a = ref.read(authProvider);
      final loc = state.matchedLocation;
      String? only(String path) => loc == path ? null : path;
      if (!ref.read(splashHoldProvider).hasValue) return only('/splash');
      switch (a.status) {
        case AuthStatus.loading:
          return only('/splash');
        case AuthStatus.signedOut:
          return only('/sign-in');
        case AuthStatus.noWorkspace:
        case AuthStatus.needsPick:
          return only('/select-workspace');
        case AuthStatus.error:
          return only('/error');
        case AuthStatus.ready:
          // A lapsed plan is read-only; billing happens on the web.
          if (a.workspace?.standing == 'lapsed') {
            return (loc == '/lapsed' || loc == '/select-workspace')
                ? null
                : '/lapsed';
          }
          const authOnly = {'/splash', '/sign-in', '/error', '/lapsed'};
          return authOnly.contains(loc) ? '/inbox' : null;
      }
    },
    routes: [
      GoRoute(path: '/', redirect: (_, _) => '/inbox'),
      GoRoute(path: '/splash', builder: (_, _) => const SplashScreen()),
      GoRoute(path: '/sign-in', builder: (_, _) => const SignInScreen()),
      GoRoute(path: '/error', builder: (_, _) => const ErrorScreen()),
      GoRoute(path: '/lapsed', builder: (_, _) => const LapsedScreen()),
      GoRoute(
        path: '/select-workspace',
        builder: (_, _) => const SelectWorkspaceScreen(),
      ),
      GoRoute(
        path: '/broadcasts/new',
        builder: (_, _) => const NewBroadcastScreen(),
      ),
      GoRoute(path: '/scan-qr', builder: (_, _) => const ScanQrScreen()),
      GoRoute(path: '/deals', builder: (_, _) => const DealsScreen()),
      GoRoute(
        path: '/tools',
        builder: (_, s) => WorkspaceToolsScreen(
          initialTab: int.tryParse(s.uri.queryParameters['tab'] ?? '') ?? 0,
        ),
      ),
      GoRoute(
        path: '/notifications',
        builder: (_, _) => const NotificationsScreen(),
      ),
      GoRoute(
        path: '/quick-replies',
        builder: (_, _) => const QuickRepliesScreen(),
      ),
      GoRoute(
        path: '/contact/:id',
        builder: (_, s) => ContactScreen(contactId: s.pathParameters['id']!),
      ),
      GoRoute(
        path: '/chat/:id',
        builder: (_, s) => ChatScreen(conversationId: s.pathParameters['id']!),
      ),
      StatefulShellRoute.indexedStack(
        builder: (_, _, shell) => AppShell(shell: shell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/home', builder: (_, _) => const HomeScreen()),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/inbox', builder: (_, _) => const InboxScreen()),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/contacts',
                builder: (_, _) => const ContactsScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/send', builder: (_, _) => const SendScreen()),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/more', builder: (_, _) => const MoreScreen()),
            ],
          ),
        ],
      ),
    ],
  );
});
