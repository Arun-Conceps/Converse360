/// Build-time config: `flutter run --dart-define-from-file=env.json`
/// (see env.example.json). Anon key only, never the service-role key.
class Config {
  static const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
  static const supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');
  static const apiUrl = String.fromEnvironment('API_URL');
  static const webUrl = String.fromEnvironment('WEB_URL',
      defaultValue: 'https://app.converse360.example');

  static bool get isSet =>
      supabaseUrl.isNotEmpty && supabaseAnonKey.isNotEmpty && apiUrl.isNotEmpty;
}
