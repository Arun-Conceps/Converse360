import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Keeps the Supabase session in the platform keystore (Keychain / Android
/// Keystore-backed storage) instead of plain SharedPreferences.
class SecureSessionStorage extends LocalStorage {
  SecureSessionStorage();
  static const _key = 'supabase.session';
  final _store = const FlutterSecureStorage();

  @override
  Future<void> initialize() async {}
  @override
  Future<bool> hasAccessToken() => _store.containsKey(key: _key);
  @override
  Future<String?> accessToken() => _store.read(key: _key);
  @override
  Future<void> removePersistedSession() => _store.delete(key: _key);
  @override
  Future<void> persistSession(String persistSessionString) =>
      _store.write(key: _key, value: persistSessionString);
}
