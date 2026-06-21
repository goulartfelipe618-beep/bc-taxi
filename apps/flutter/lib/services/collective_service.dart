import 'api_client.dart';

class CollectiveQuote {
  const CollectiveQuote({
    required this.categoryCode,
    required this.categoryName,
    required this.baseFareCentavos,
    required this.finalFareCentavos,
    required this.passengerCount,
    required this.maxPassengers,
    required this.requiresScheduling,
  });

  final String categoryCode;
  final String categoryName;
  final int baseFareCentavos;
  final int finalFareCentavos;
  final int passengerCount;
  final int maxPassengers;
  final bool requiresScheduling;

  factory CollectiveQuote.fromJson(Map<String, dynamic> json) {
    return CollectiveQuote(
      categoryCode: json['categoryCode'] as String,
      categoryName: json['categoryName'] as String,
      baseFareCentavos: json['baseFareCentavos'] as int,
      finalFareCentavos: json['finalFareCentavos'] as int,
      passengerCount: json['passengerCount'] as int,
      maxPassengers: json['maxPassengers'] as int,
      requiresScheduling: json['requiresScheduling'] as bool? ?? true,
    );
  }
}

class CollectiveService {
  CollectiveService(this._client);

  final ApiClient _client;

  Future<CollectiveQuote> quote({
    required String categoryCode,
    required int distanceKm,
    required int durationMin,
    required int passengerCount,
    int baggageCount = 0,
    bool isAirportShuttle = false,
    bool isLargeGroup = false,
  }) async {
    final res = await _client.post('/v1/collective/quote', body: {
      'categoryCode': categoryCode,
      'distanceKm': distanceKm,
      'durationMin': durationMin,
      'passengerCount': passengerCount,
      'baggageCount': baggageCount,
      'isAirportShuttle': isAirportShuttle,
      'isLargeGroup': isLargeGroup,
    });
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return CollectiveQuote.fromJson(data);
  }

  Future<Map<String, dynamic>> book({
    required String categoryCode,
    required int distanceKm,
    required int durationMin,
    required int passengerCount,
    required double pickupLat,
    required double pickupLng,
    required double dropoffLat,
    required double dropoffLng,
    required String scheduledAt,
    int baggageCount = 0,
    String? groupLabel,
  }) async {
    final res = await _client.post('/v1/collective/bookings', body: {
      'categoryCode': categoryCode,
      'distanceKm': distanceKm,
      'durationMin': durationMin,
      'passengerCount': passengerCount,
      'baggageCount': baggageCount,
      'pickupLat': pickupLat,
      'pickupLng': pickupLng,
      'dropoffLat': dropoffLat,
      'dropoffLng': dropoffLng,
      'scheduledAt': scheduledAt,
      if (groupLabel != null) 'groupLabel': groupLabel,
    });
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return data;
  }
}
