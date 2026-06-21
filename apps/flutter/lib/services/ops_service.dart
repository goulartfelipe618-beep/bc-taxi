import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/api_config.dart';

class OpsDashboard {
  const OpsDashboard({
    this.alertCount = 0,
    this.openAlerts = const [],
    this.platformHealth,
  });

  final int alertCount;
  final List<Map<String, dynamic>> openAlerts;
  final Map<String, dynamic>? platformHealth;

  factory OpsDashboard.fromJson(Map<String, dynamic> json) {
    return OpsDashboard(
      alertCount: (json['alertCount'] as num?)?.toInt() ?? 0,
      openAlerts: (json['openAlerts'] as List<dynamic>? ?? []).cast<Map<String, dynamic>>(),
      platformHealth: json['platformHealth'] as Map<String, dynamic>?,
    );
  }
}

class OpsService {
  static Future<Map<String, dynamic>?> fetchHealth() async {
    final uri = Uri.parse('$apiBaseUrl/v1/ops/health');
    final res = await http.get(uri).timeout(const Duration(seconds: 6));
    if (res.statusCode != 200) return null;
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  static Future<OpsDashboard?> fetchDashboard() async {
    final uri = Uri.parse('$apiBaseUrl/v1/ops/dashboard');
    final res = await http.get(uri).timeout(const Duration(seconds: 8));
    if (res.statusCode != 200) return null;
    return OpsDashboard.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  static Future<List<Map<String, dynamic>>> fetchOpenAlerts() async {
    final uri = Uri.parse('$apiBaseUrl/v1/ops/alerts');
    final res = await http.get(uri).timeout(const Duration(seconds: 6));
    if (res.statusCode != 200) return [];
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return (body['alerts'] as List<dynamic>).cast<Map<String, dynamic>>();
  }

  static Future<Map<String, dynamic>?> fetchRideTrace({
    required String token,
    required String rideId,
  }) async {
    final uri = Uri.parse('$apiBaseUrl/v1/ops/traces/$rideId');
    final res = await http
        .get(uri, headers: {'Authorization': 'Bearer $token'})
        .timeout(const Duration(seconds: 8));
    if (res.statusCode != 200) return null;
    return jsonDecode(res.body) as Map<String, dynamic>;
  }
}
