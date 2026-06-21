import 'api_client.dart';

class DeliveryJob {
  const DeliveryJob({
    required this.id,
    required this.rideId,
    required this.packageDescription,
    required this.status,
    this.estimatedFareCentavos,
    this.pickupPin,
    this.dropoffPin,
    this.isFragile = false,
    this.isPriority = false,
  });

  final String id;
  final String rideId;
  final String packageDescription;
  final String status;
  final int? estimatedFareCentavos;
  final String? pickupPin;
  final String? dropoffPin;
  final bool isFragile;
  final bool isPriority;

  factory DeliveryJob.fromJson(Map<String, dynamic> json) {
    return DeliveryJob(
      id: json['id'] as String,
      rideId: json['rideId'] as String,
      packageDescription: json['packageDescription'] as String,
      status: json['status'] as String,
      estimatedFareCentavos: json['estimatedFareCentavos'] as int?,
      pickupPin: json['pickupPin'] as String?,
      dropoffPin: json['dropoffPin'] as String?,
      isFragile: json['isFragile'] as bool? ?? false,
      isPriority: json['isPriority'] as bool? ?? false,
    );
  }
}

class DeliveryService {
  DeliveryService(this._client);

  final ApiClient _client;

  Future<DeliveryJob> create({
    required double pickupLat,
    required double pickupLng,
    required double dropoffLat,
    required double dropoffLng,
    required String packageDescription,
    String? pickupAddress,
    String? dropoffAddress,
    double? declaredWeightKg,
    int? declaredValueCentavos,
    bool isFragile = false,
    bool isPriority = false,
    double? distanceKm,
    double? durationMin,
    String? paymentMethodId,
  }) async {
    final res = await _client.post('/v1/deliveries', body: {
      'pickupLat': pickupLat,
      'pickupLng': pickupLng,
      'dropoffLat': dropoffLat,
      'dropoffLng': dropoffLng,
      if (pickupAddress != null) 'pickupAddress': pickupAddress,
      if (dropoffAddress != null) 'dropoffAddress': dropoffAddress,
      'packageDescription': packageDescription,
      if (declaredWeightKg != null) 'declaredWeightKg': declaredWeightKg,
      if (declaredValueCentavos != null) 'declaredValueCentavos': declaredValueCentavos,
      'isFragile': isFragile,
      'isPriority': isPriority,
      if (distanceKm != null) 'distanceKm': distanceKm,
      if (durationMin != null) 'durationMin': durationMin,
      if (paymentMethodId != null) 'paymentMethodId': paymentMethodId,
    });
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return DeliveryJob.fromJson(data['delivery'] as Map<String, dynamic>);
  }

  Future<List<DeliveryJob>> listMine() async {
    final res = await _client.get('/v1/deliveries');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    final list = (data['deliveries'] as List<dynamic>).cast<Map<String, dynamic>>();
    return list.map(DeliveryJob.fromJson).toList();
  }

  Future<DeliveryJob> confirmPickup(String id, String pin) async {
    final res = await _client.post('/v1/deliveries/$id/proof/pickup', body: {'pin': pin});
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return DeliveryJob.fromJson(data['delivery'] as Map<String, dynamic>);
  }

  Future<DeliveryJob> confirmDropoff(String id, String pin) async {
    final res = await _client.post('/v1/deliveries/$id/proof/dropoff', body: {'pin': pin});
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return DeliveryJob.fromJson(data['delivery'] as Map<String, dynamic>);
  }
}
