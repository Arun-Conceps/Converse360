import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _prefKey = 'app_lock_enabled';

/// Device-local biometric / screen-lock gate. It protects the app on THIS phone
/// only; it is not an account credential and the server never sees it.
class AppLockState {
  const AppLockState({this.enabled = false, this.locked = false, this.loaded = false});
  final bool enabled;
  final bool locked;
  final bool loaded;
  AppLockState copyWith({bool? enabled, bool? locked, bool? loaded}) => AppLockState(
      enabled: enabled ?? this.enabled,
      locked: locked ?? this.locked,
      loaded: loaded ?? this.loaded);
}

class AppLock extends Notifier<AppLockState> {
  final _auth = LocalAuthentication();
  DateTime? _backgroundedAt;

  /// Re-lock only after this long away, so answering a text does not cost a
  /// fingerprint every time.
  static const grace = Duration(seconds: 30);

  @override
  AppLockState build() {
    _load();
    return const AppLockState();
  }

  Future<void> _load() async {
    final p = await SharedPreferences.getInstance();
    final on = p.getBool(_prefKey) ?? false;
    // Cold start with the lock on = locked.
    state = AppLockState(enabled: on, locked: on, loaded: true);
  }

  Future<bool> get supported async =>
      await _auth.isDeviceSupported() || await _auth.canCheckBiometrics;

  Future<bool> _prompt(String reason) async {
    try {
      return await _auth.authenticate(localizedReason: reason);
    } catch (_) {
      return false;
    }
  }

  Future<bool> unlock() async {
    final ok = await _prompt('Unlock Converse360');
    if (ok) state = state.copyWith(locked: false);
    return ok;
  }

  /// Turning it on or off both require proving it is you.
  Future<bool> setEnabled(bool on) async {
    if (on && !await supported) return false;
    if (!await _prompt(on ? 'Confirm to turn on app lock' : 'Confirm to turn off app lock')) {
      return false;
    }
    final p = await SharedPreferences.getInstance();
    await p.setBool(_prefKey, on);
    state = state.copyWith(enabled: on, locked: false);
    return true;
  }

  void wentToBackground() => _backgroundedAt = DateTime.now();

  void cameToForeground() {
    final at = _backgroundedAt;
    _backgroundedAt = null;
    if (state.enabled && at != null && DateTime.now().difference(at) > grace) {
      state = state.copyWith(locked: true);
    }
  }
}

final appLockProvider = NotifierProvider<AppLock, AppLockState>(AppLock.new);
