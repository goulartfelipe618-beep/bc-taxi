import '../config/api_config.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

class SharedQuote {
  const SharedQuote({
    required this.baseFareCentavos,
    required this.discountCentavos,
    required this.finalFareCentavos,
    required this.soloRide,
    this.matchedPoolId,
    this.detourMin = 0,
  });

  final int baseFareCentavos;
  final int discountCentavos;
  final int finalFareCentavos;
  final bool soloRide;
  final String? matchedPoolId;
  final double detourMin;

  factory SharedQuote.fromJson(Map<String, dynamic> json) {
    return SharedQuote(
      baseFareCentavos: (json['baseFareCentavos'] as num).toInt(),
      discountCentavos: (json['discountCentavos'] as num).toInt(),
      finalFareCentavos: (json['finalFareCentavos'] as num).toInt(),
      soloRide: json['soloRide'] as bool? ?? true,
      matchedPoolId: json['matchedPoolId'] as String?,
      detourMin: (json['detourMin'] as num?)?.toDouble() ?? 0,
    );
  }
}

class SharedPool {
  const SharedPool({
    required this.id,
    required this.status,
    required this.bookingCount,
    required this.maxBookings,
  });

  final String id;
  final String status;
  final int bookingCount;
  final int maxBookings;

  factory SharedPool.fromJson(Map<String, dynamic> json) {
    return SharedPool(
      id: json['id'] as String,
      status: json['status'] as String,
      bookingCount: (json['bookingCount'] as num).toInt(),
      maxBookings: (json['maxBookings'] as num).toInt(),
    );
  }
}

class SharedRideService {
  static Future<SharedQuote?> fetchQuote({
    required String token,
    required double distanceKm,
    required double durationMin,
    required double pickupLat,
    required double pickupLng,
    required double dropoffLat,
    required double dropoffLng,
    bool hasLargeBaggage = false,
  }) async {
    final uri = Uri.parse('$apiBaseUrl/v1/shared/quote');
    final res = await http
        .post(
          uri,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer $token',
          },
          body: jsonEncode({
            'distanceKm': distanceKm,
            'durationMin': durationMin,
            'pickupLat': pickupLat,
            'pickupLng': pickupLng,
            'dropoffLat': dropoffLat,
            'dropoffLng': dropoffLng,
            'hasLargeBaggage': hasLargeBaggage,
          }),
        )
        .timeout(const Duration(seconds: 8));
    if (res.statusCode != 200) return null;
    return SharedQuote.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  static Future<SharedPool?> fetchPool({required String token, required String poolId}) async {
    final uri = Uri.parse('$apiBaseUrl/v1/shared/pools/$poolId');
    final res = await http
        .get(uri, headers: {'Authorization': 'Bearer $token'})
        .timeout(const Duration(seconds: 5));
    if (res.statusCode != 200) return null;
    return SharedPool.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }
}
