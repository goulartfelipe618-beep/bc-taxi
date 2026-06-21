import 'api_client.dart';

class ScheduledRide {
  const ScheduledRide({
    required this.id,
    required this.categoryCode,
    required this.scheduledAt,
    required this.status,
    this.pickupAddress,
    this.dropoffAddress,
    this.rideId,
    this.estimatedFareCentavos,
    this.discountCentavos = 0,
    this.promoCode,
  });

  final String id;
  final String categoryCode;
  final String scheduledAt;
  final String status;
  final String? pickupAddress;
  final String? dropoffAddress;
  final String? rideId;
  final int? estimatedFareCentavos;
  final int discountCentavos;
  final String? promoCode;

  factory ScheduledRide.fromJson(Map<String, dynamic> json) {
    return ScheduledRide(
      id: json['id'] as String,
      categoryCode: json['categoryCode'] as String,
      scheduledAt: json['scheduledAt'] as String,
      status: json['status'] as String,
      pickupAddress: json['pickupAddress'] as String?,
      dropoffAddress: json['dropoffAddress'] as String?,
      rideId: json['rideId'] as String?,
      estimatedFareCentavos: json['estimatedFareCentavos'] as int?,
      discountCentavos: json['discountCentavos'] as int? ?? 0,
      promoCode: json['promoCode'] as String?,
    );
  }
}

class ScheduleService {
  ScheduleService(this._client);

  final ApiClient _client;

  Future<ScheduledRide> create({
    required String categoryCode,
    required double pickupLat,
    required double pickupLng,
    required double dropoffLat,
    required double dropoffLng,
    required DateTime scheduledAt,
    String? pickupAddress,
    String? dropoffAddress,
    String? paymentMethodId,
    String? promoCode,
    double? distanceKm,
    double? durationMin,
  }) async {
    final res = await _client.post('/v1/schedules', body: {
      'categoryCode': categoryCode,
      'pickupLat': pickupLat,
      'pickupLng': pickupLng,
      if (pickupAddress != null) 'pickupAddress': pickupAddress,
      'dropoffLat': dropoffLat,
      'dropoffLng': dropoffLng,
      if (dropoffAddress != null) 'dropoffAddress': dropoffAddress,
      'scheduledAt': scheduledAt.toUtc().toIso8601String(),
      if (paymentMethodId != null) 'paymentMethodId': paymentMethodId,
      if (promoCode != null) 'promoCode': promoCode,
      if (distanceKm != null) 'distanceKm': distanceKm,
      if (durationMin != null) 'durationMin': durationMin,
    });
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return ScheduledRide.fromJson(data['schedule'] as Map<String, dynamic>);
  }

  Future<List<ScheduledRide>> listMine() async {
    final res = await _client.get('/v1/schedules');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    final list = (data['schedules'] as List<dynamic>).cast<Map<String, dynamic>>();
    return list.map(ScheduledRide.fromJson).toList();
  }

  Future<ScheduledRide> cancel(String id, {String? reason}) async {
    final res = await _client.post('/v1/schedules/$id/cancel', body: {
      if (reason != null) 'reason': reason,
    });
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return ScheduledRide.fromJson(data['schedule'] as Map<String, dynamic>);
  }
}
