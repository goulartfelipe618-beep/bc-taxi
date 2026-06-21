import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/api_config.dart';

class RouteStrategyOption {
  const RouteStrategyOption({
    required this.strategy,
    required this.label,
    required this.description,
    required this.icon,
  });

  final String strategy;
  final String label;
  final String description;
  final String icon;

  factory RouteStrategyOption.fromJson(Map<String, dynamic> json) {
    return RouteStrategyOption(
      strategy: json['strategy'] as String,
      label: json['label'] as String,
      description: json['description'] as String,
      icon: json['icon'] as String,
    );
  }
}

class RouteAlternativeOption {
  const RouteAlternativeOption({
    required this.strategy,
    required this.label,
    required this.etaMinutes,
    required this.distanceKm,
    required this.estimatedFareCentavos,
    this.passengerFareLabel,
    this.isRecommended = false,
    this.geometry,
  });

  final String strategy;
  final String label;
  final int etaMinutes;
  final double distanceKm;
  final int estimatedFareCentavos;
  final String? passengerFareLabel;
  final bool isRecommended;
  final Map<String, dynamic>? geometry;

  factory RouteAlternativeOption.fromJson(Map<String, dynamic> json) {
    return RouteAlternativeOption(
      strategy: json['strategy'] as String,
      label: json['label'] as String? ?? json['strategy'] as String,
      etaMinutes: (json['etaMinutes'] as num?)?.toInt() ?? ((json['etaSeconds'] as num?)?.toInt() ?? 0) ~/ 60,
      distanceKm: (json['distanceKm'] as num?)?.toDouble() ??
          ((json['distanceM'] as num?)?.toDouble() ?? 0) / 1000,
      estimatedFareCentavos: (json['estimatedFareCentavos'] as num?)?.toInt() ?? 0,
      passengerFareLabel: json['passengerFareLabel'] as String?,
      isRecommended: json['isRecommended'] as bool? ?? false,
      geometry: json['geometry'] as Map<String, dynamic>?,
    );
  }
}

class RouteQuoteResult {
  const RouteQuoteResult({
    required this.requestId,
    required this.selectedStrategy,
    required this.recommended,
    required this.alternatives,
  });

  final String requestId;
  final String selectedStrategy;
  final RouteAlternativeOption recommended;
  final List<RouteAlternativeOption> alternatives;

  factory RouteQuoteResult.fromJson(Map<String, dynamic> json) {
    final alts = (json['alternatives'] as List<dynamic>)
        .cast<Map<String, dynamic>>()
        .map(RouteAlternativeOption.fromJson)
        .toList();
    return RouteQuoteResult(
      requestId: json['requestId'] as String,
      selectedStrategy: json['selectedStrategy'] as String,
      recommended: RouteAlternativeOption.fromJson(json['recommended'] as Map<String, dynamic>),
      alternatives: alts,
    );
  }
}

class RouteService {
  static Future<List<RouteStrategyOption>> fetchStrategies() async {
    final res = await http.get(Uri.parse('$apiBaseUrl/v1/routes/strategies')).timeout(const Duration(seconds: 5));
    if (res.statusCode != 200) return [];
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return (body['strategies'] as List<dynamic>)
        .cast<Map<String, dynamic>>()
        .map(RouteStrategyOption.fromJson)
        .toList();
  }

  static Future<RouteQuoteResult?> fetchQuote({
    required String token,
    required double fromLat,
    required double fromLng,
    required double toLat,
    required double toLng,
    required String categoryCode,
    String? strategy,
  }) async {
    final uri = Uri.parse('$apiBaseUrl/v1/routes/quote');
    final res = await http
        .post(
          uri,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer $token',
          },
          body: jsonEncode({
            'fromLat': fromLat,
            'fromLng': fromLng,
            'toLat': toLat,
            'toLng': toLng,
            'categoryCode': categoryCode,
            if (strategy != null) 'strategy': strategy,
          }),
        )
        .timeout(const Duration(seconds: 10));
    if (res.statusCode != 200) return null;
    return RouteQuoteResult.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  static Future<RouteQuoteResult?> selectStrategy({
    required String token,
    required String requestId,
    required String strategy,
    String? categoryCode,
  }) async {
    final uri = Uri.parse('$apiBaseUrl/v1/routes/select');
    final res = await http
        .post(
          uri,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer $token',
          },
          body: jsonEncode({
            'requestId': requestId,
            'strategy': strategy,
            if (categoryCode != null) 'categoryCode': categoryCode,
          }),
        )
        .timeout(const Duration(seconds: 8));
    if (res.statusCode != 200) return null;
    return RouteQuoteResult.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }
}
