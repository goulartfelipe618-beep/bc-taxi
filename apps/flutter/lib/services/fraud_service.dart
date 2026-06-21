import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/api_config.dart';

class FraudRiskProfile {
  const FraudRiskProfile({
    required this.riskScore,
    this.latestDecision,
    this.activeBlocks = const [],
    this.linkedUserCount = 0,
    this.riskFlags = const [],
    this.locationTrustScore,
  });

  final double riskScore;
  final Map<String, dynamic>? latestDecision;
  final List<Map<String, dynamic>> activeBlocks;
  final int linkedUserCount;
  final List<String> riskFlags;
  final double? locationTrustScore;

  factory FraudRiskProfile.fromJson(Map<String, dynamic> json) {
    final graph = json['deviceGraph'] as Map<String, dynamic>?;
    final trust = json['locationTrust'] as Map<String, dynamic>?;
    return FraudRiskProfile(
      riskScore: (json['riskScore'] as num?)?.toDouble() ?? 0,
      latestDecision: json['latestDecision'] as Map<String, dynamic>?,
      activeBlocks: (json['activeBlocks'] as List<dynamic>? ?? []).cast<Map<String, dynamic>>(),
      linkedUserCount: (graph?['linkedUserCount'] as num?)?.toInt() ?? 0,
      riskFlags: (graph?['riskFlags'] as List<dynamic>? ?? []).cast<String>(),
      locationTrustScore: (trust?['trustScore'] as num?)?.toDouble(),
    );
  }
}

class FraudService {
  static Map<String, String> _headers(String token, {String? deviceId}) {
    final headers = {'Authorization': 'Bearer $token'};
    if (deviceId != null && deviceId.isNotEmpty) {
      headers['x-device-id'] = deviceId;
    }
    return headers;
  }

  static Future<FraudRiskProfile?> fetchRiskProfile({
    required String token,
    String? deviceId,
  }) async {
    final uri = Uri.parse('$apiBaseUrl/v1/fraud/risk/me');
    final res = await http
        .get(uri, headers: _headers(token, deviceId: deviceId))
        .timeout(const Duration(seconds: 8));
    if (res.statusCode != 200) return null;
    return FraudRiskProfile.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  static Future<Map<String, dynamic>?> fetchActiveBlocks({
    required String token,
    String? deviceId,
  }) async {
    final uri = Uri.parse('$apiBaseUrl/v1/fraud/blocks/me');
    final res = await http
        .get(uri, headers: _headers(token, deviceId: deviceId))
        .timeout(const Duration(seconds: 8));
    if (res.statusCode != 200) return null;
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>?> evaluateRideRisk({
    required String token,
    String? deviceId,
    String? paymentMethodType,
    int? amountCentavos,
  }) async {
    final uri = Uri.parse('$apiBaseUrl/v1/fraud/risk/evaluate');
    final res = await http
        .post(
          uri,
          headers: {
            ..._headers(token, deviceId: deviceId),
            'Content-Type': 'application/json',
          },
          body: jsonEncode({
            if (paymentMethodType != null) 'paymentMethodType': paymentMethodType,
            if (amountCentavos != null) 'amountCentavos': amountCentavos,
          }),
        )
        .timeout(const Duration(seconds: 8));
    if (res.statusCode != 200) return null;
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  static Future<List<Map<String, dynamic>>> fetchSuspiciousRides({
    required String token,
    int limit = 50,
  }) async {
    final uri = Uri.parse('$apiBaseUrl/v1/fraud/suspicious-rides?limit=$limit');
    final res = await http
        .get(uri, headers: _headers(token))
        .timeout(const Duration(seconds: 8));
    if (res.statusCode != 200) return [];
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return (body['flags'] as List<dynamic>? ?? []).cast<Map<String, dynamic>>();
  }
}
