import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/api_config.dart';

class DynamicPricingStatus {
  const DynamicPricingStatus({
    required this.categoryCode,
    required this.multiplierEffective,
    required this.multiplierRaw,
    required this.guardFlags,
    this.calculationVersion,
  });

  final String categoryCode;
  final double multiplierEffective;
  final double multiplierRaw;
  final List<String> guardFlags;
  final String? calculationVersion;

  factory DynamicPricingStatus.fromJson(Map<String, dynamic> json) {
    return DynamicPricingStatus(
      categoryCode: json['categoryCode'] as String,
      multiplierEffective: (json['multiplierEffective'] as num).toDouble(),
      multiplierRaw: (json['multiplierRaw'] as num).toDouble(),
      guardFlags: (json['guardFlags'] as List<dynamic>? ?? []).cast<String>(),
      calculationVersion: json['calculationVersion'] as String?,
    );
  }
}

class PricingService {
  static Future<DynamicPricingStatus?> fetchDynamicStatus({
    String categoryCode = 'economico',
    double? lat,
    double? lng,
  }) async {
    final params = {
      'category': categoryCode,
      if (lat != null) 'lat': '$lat',
      if (lng != null) 'lng': '$lng',
    };
    final uri = Uri.parse('$apiBaseUrl/v1/pricing/dynamic').replace(queryParameters: params);
    final res = await http.get(uri).timeout(const Duration(seconds: 8));
    if (res.statusCode != 200) return null;
    return DynamicPricingStatus.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  static Future<List<Map<String, dynamic>>> fetchDynamicLogs(String categoryCode) async {
    final uri = Uri.parse('$apiBaseUrl/v1/pricing/dynamic/logs/$categoryCode');
    final res = await http.get(uri).timeout(const Duration(seconds: 8));
    if (res.statusCode != 200) return [];
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return (body['logs'] as List<dynamic>).cast<Map<String, dynamic>>();
  }
}
