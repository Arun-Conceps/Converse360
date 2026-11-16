import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/api.dart';
import '../core/models.dart';

/// loading     resolving session / workspaces
/// signedOut   no session
/// noWorkspace a REAL state (removed from their only workspace), not an error
/// needsPick   several workspaces and none chosen yet
/// ready       [AuthState.accountId] is set; account-scoped queries may run
enum AuthStatus { loading, signedOut, noWorkspace, needsPick, ready, error }

class AuthState {
  const AuthState({
    required this.status,
    this.userId,
    this.email,
    this.workspaces = const [],
    this.accountId,
    this.error,
  });

  final AuthStatus status;
  final String? userId;
  final String? email;
  final List<Workspace> workspaces;
  final String? accountId;
  final String? error;

  Workspace? get workspace {
    for (final w in workspaces) {
      if (w.id == accountId) return w;
    }
    return null;
  }

  AuthState copyWith({
    AuthStatus? status,
    List<Workspace>? workspaces,
    String? accountId,
    bool clearAccount = false,
    String? error,
  }) =>
      AuthState(
        status: status ?? this.status,
        userId: userId,
        email: email,
        workspaces: workspaces ?? this.workspaces,
        accountId: clearAccount ? null : (accountId ?? this.accountId),
        error: error,
      );
}

final apiProvider = Provider<ApiClient>((_) => ApiClient());

final authProvider =
    NotifierProvider<AuthController, AuthState>(AuthController.new);

/// Gate every account-scoped query on this being non-null: filtering on null
/// returns nothing, which looks exactly like an empty inbox.
final accountIdProvider =
    Provider<String?>((ref) => ref.watch(authProvider.select((s) => s.accountId)));

class AuthController extends Notifier<AuthState> {
  SupabaseClient get _sb => Supabase.instance.client;
  ApiClient get _api => ref.read(apiProvider);
  static const _wsKey = 'c360_ws';

  @override
  AuthState build() {
    final sub = _sb.auth.onAuthStateChange.listen((d) => _onSession(d.session));
    ref.onDispose(sub.cancel);

    final s = _sb.auth.currentSession;
    if (s == null) return const AuthState(status: AuthStatus.signedOut);
    Future.microtask(load);
    return AuthState(
        status: AuthStatus.loading, userId: s.user.id, email: s.user.email);
  }

  void _onSession(Session? s) {
    if (s == null) {
      _api.workspaceId = null;
      state = const AuthState(status: AuthStatus.signedOut);
    } else if (state.userId != s.user.id) {
      // Token refreshes keep the same user and are ignored.
      state = AuthState(
          status: AuthStatus.loading, userId: s.user.id, email: s.user.email);
      load();
    }
  }

  Future<void> load() async {
    final uid = state.userId;
    if (uid == null) return;
    try {
      final res = await _api.request('GET', '/account/workspaces')
          as Map<String, dynamic>;
      final list = (res['workspaces'] as List)
          .map((e) => Workspace.fromJson(e as Map<String, dynamic>))
          .toList();
      final prefs = await SharedPreferences.getInstance();
      final stored = prefs.getString('$_wsKey:$uid');
      bool valid(String? id) => id != null && list.any((w) => w.id == id);
      // Stored choice, else the only workspace, else ask. The server's own
      // fallback is deliberately NOT used when several exist: landing an agency
      // operator in the wrong client is how somebody broadcasts to it.
      final pick = valid(stored)
          ? stored
          : (list.length == 1 ? list.first.id : null);
      _api.workspaceId = pick;
      state = AuthState(
        status: list.isEmpty
            ? AuthStatus.noWorkspace
            : (pick == null ? AuthStatus.needsPick : AuthStatus.ready),
        userId: uid,
        email: state.email,
        workspaces: list,
        accountId: pick,
      );
    } on ApiException catch (e) {
      if (e.status == 403 && e.code == 'no_workspace') {
        _api.workspaceId = null;
        state = AuthState(
            status: AuthStatus.noWorkspace, userId: uid, email: state.email);
      } else {
        state = state.copyWith(status: AuthStatus.error, error: e.message);
      }
    } catch (e) {
      state = state.copyWith(status: AuthStatus.error, error: e.toString());
    }
  }

  Future<void> retry() async {
    state = state.copyWith(status: AuthStatus.loading);
    await load();
  }

  /// Providers watch [accountIdProvider], so changing it tears down every
  /// realtime channel and refetches under the new workspace: the mobile
  /// equivalent of the web's forced full reload.
  Future<void> selectWorkspace(String id) async {
    await _api.request('POST', '/account/workspaces/active',
        body: {'accountId': id});
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('$_wsKey:${state.userId}', id);
    _api.workspaceId = id;
    state = state.copyWith(status: AuthStatus.ready, accountId: id);
  }

  /// Returns an error message, or null on success.
  Future<String?> signIn(String email, String password) async {
    try {
      await _sb.auth
          .signInWithPassword(email: email.trim(), password: password);
      return null;
    } on AuthException catch (e) {
      return e.message;
    } catch (e) {
      return 'Could not sign in. Check your connection.';
    }
  }

  Future<void> signOut() => _sb.auth.signOut();
}
