import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import 'config.dart';

class ApiException implements Exception {
  ApiException(this.status, this.message, {this.code});
  final int status;
  final String message;
  final String? code;
  @override
  String toString() => message;
}

/// Talks to apps/api with the Supabase access token as a Bearer header.
///
/// [workspaceId] is a SELECTION, not a credential: the API matches it against
/// account_members (apps/api auth/active-workspace.ts). Set only by AuthController.
class ApiClient {
  String? workspaceId;

  Future<dynamic> request(String method, String path, {Object? body}) async {
    final token = Supabase.instance.client.auth.currentSession?.accessToken;
    if (token == null) throw ApiException(401, 'Not signed in');

    final req = http.Request(method, Uri.parse('${Config.apiUrl}$path'))
      ..headers.addAll({
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
        'x-workspace-id': ?workspaceId,
      });
    if (body != null) req.body = jsonEncode(body);

    final res = await http.Response.fromStream(await req.send());
    dynamic json;
    try {
      json = res.body.isEmpty ? null : jsonDecode(res.body);
    } catch (_) {}

    if (res.statusCode >= 400) {
      final err = json is Map ? json['error'] : null;
      final code =
          err is String ? err : (err is Map ? err['code'] as String? : null);
      final msg = (json is Map ? json['message'] : null) ??
          (err is String ? err : null) ??
          'Request failed (${res.statusCode})';
      throw ApiException(res.statusCode, msg.toString(), code: code);
    }
    return json;
  }
}
