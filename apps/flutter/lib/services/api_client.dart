import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/api_config.dart';

class ApiClient {
  ApiClient(this.token);

  final String token;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      };

  Future<http.Response> get(String path) {
    return http.get(Uri.parse('$apiBaseUrl$path'), headers: _headers);
  }

  Future<http.Response> post(String path, {Object? body}) {
    return http.post(
      Uri.parse('$apiBaseUrl$path'),
      headers: _headers,
      body: body == null ? null : jsonEncode(body),
    );
  }

  static Future<http.Response> getPublic(String path) {
    return http.get(Uri.parse('$apiBaseUrl$path'));
  }

  static Future<http.Response> postPublic(String path, {Object? body}) {
    return http.post(
      Uri.parse('$apiBaseUrl$path'),
      headers: {'Content-Type': 'application/json'},
      body: body == null ? null : jsonEncode(body),
    );
  }

  Map<String, dynamic> decodeJson(http.Response res) {
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  void throwIfError(http.Response res, Map<String, dynamic> data) {
    if (res.statusCode >= 400) {
      final err = data['error'];
      if (err is String) throw ApiException(err, res.statusCode);
      throw ApiException('Erro na API (${res.statusCode})', res.statusCode);
    }
  }
}

class ApiException implements Exception {
  ApiException(this.message, this.statusCode);

  final String message;
  final int statusCode;

  @override
  String toString() => message;
}
