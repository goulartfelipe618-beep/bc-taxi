import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/api_config.dart';
import '../constants/passenger_data.dart';
import '../models/ride_category.dart';

class CatalogService {
  static Future<List<RideCategoryOption>> fetchPassengerCategories({bool immediateOnly = true}) async {
    try {
      final uri = Uri.parse('$apiBaseUrl/v1/categories?passengerRidesOnly=true');
      final res = await http.get(uri).timeout(const Duration(seconds: 5));
      if (res.statusCode != 200) return rideCategories;

      final body = jsonDecode(res.body) as Map<String, dynamic>;
      final list = (body['categories'] as List<dynamic>).cast<Map<String, dynamic>>();
      final mapped = list.map(_mapCategory).toList();
      if (immediateOnly) {
        return mapped.where((c) => !c.requiresScheduling).toList();
      }
      return mapped;
    } catch (_) {
      return rideCategories;
    }
  }

  static Future<RideQuote?> fetchQuote({
    required String categoryCode,
    required double distanceKm,
    required double durationMin,
  }) async {
    try {
      final uri = Uri.parse('$apiBaseUrl/v1/quotes');
      final res = await http
          .post(
            uri,
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'categoryCode': categoryCode,
              'distanceKm': distanceKm,
              'durationMin': durationMin,
            }),
          )
          .timeout(const Duration(seconds: 5));
      if (res.statusCode != 200) return null;
      return RideQuote.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  static RideCategoryOption _mapCategory(Map<String, dynamic> json) {
    final api = ApiRideCategory.fromJson(json);
    return RideCategoryOption(
      id: api.code,
      name: api.name,
      capacity: api.passengerLimitMax,
      priceLabel: '—',
      etaLabel: _defaultEta(api.code),
      description: api.description,
      badge: api.isPremium ? 'Premium' : null,
      badgeIsGreen: false,
      requiresScheduling: api.requiresScheduling,
    );
  }

  static String _defaultEta(String code) {
    switch (code) {
      case 'moto':
        return '6 min · chegada em 8 min';
      case 'comfort':
        return '7 min · chegada em 9 min';
      case 'executivo':
      case 'black':
        return '8 min · chegada em 11 min';
      case 'suv':
      case 'van':
        return '10 min · chegada em 14 min';
      case 'compartilhado':
        return '12 min · chegada em 18 min';
      default:
        return '4 min · chegada em 6 min';
    }
  }
}
