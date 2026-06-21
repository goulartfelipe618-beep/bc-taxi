import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/api_config.dart';

class DriverPayoutBreakdown {
  const DriverPayoutBreakdown({
    required this.driverGrossCentavos,
    required this.passengerGrossCentavos,
    required this.components,
    this.dynamicMultiplier,
    this.reputationTier,
  });

  final int driverGrossCentavos;
  final int passengerGrossCentavos;
  final Map<String, dynamic> components;
  final double? dynamicMultiplier;
  final String? reputationTier;

  factory DriverPayoutBreakdown.fromJson(Map<String, dynamic> json) {
    return DriverPayoutBreakdown(
      driverGrossCentavos: (json['driverGrossCentavos'] as num).toInt(),
      passengerGrossCentavos: (json['passengerGrossCentavos'] as num).toInt(),
      components: (json['components'] as Map<String, dynamic>? ?? {}),
      dynamicMultiplier: (json['dynamicMultiplier'] as num?)?.toDouble(),
      reputationTier: json['reputationTier'] as String?,
    );
  }
}

class DriverPayoutService {
  static Future<Map<String, dynamic>?> fetchSummary(String token) async {
    final uri = Uri.parse('$apiBaseUrl/v1/driver/payout/summary');
    final res = await http
        .get(uri, headers: {'Authorization': 'Bearer $token'})
        .timeout(const Duration(seconds: 8));
    if (res.statusCode != 200) return null;
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  static Future<DriverPayoutBreakdown?> previewPayout({
    required String token,
    required String categoryCode,
    required double distanceKm,
    required double durationMin,
    int passengerDiscountCentavos = 0,
  }) async {
    final uri = Uri.parse('$apiBaseUrl/v1/driver/payout/preview');
    final res = await http
        .post(
          uri,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer $token',
          },
          body: jsonEncode({
            'categoryCode': categoryCode,
            'distanceKm': distanceKm,
            'durationMin': durationMin,
            'passengerDiscountCentavos': passengerDiscountCentavos,
          }),
        )
        .timeout(const Duration(seconds: 10));
    if (res.statusCode != 200) return null;
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return DriverPayoutBreakdown.fromJson(body['breakdown'] as Map<String, dynamic>);
  }

  static Future<DriverPayoutBreakdown?> fetchRideBreakdown({
    required String token,
    required String rideId,
  }) async {
    final uri = Uri.parse('$apiBaseUrl/v1/driver/payout/rides/$rideId/breakdown');
    final res = await http
        .get(uri, headers: {'Authorization': 'Bearer $token'})
        .timeout(const Duration(seconds: 8));
    if (res.statusCode != 200) return null;
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return DriverPayoutBreakdown.fromJson(body['breakdown'] as Map<String, dynamic>);
  }
}
