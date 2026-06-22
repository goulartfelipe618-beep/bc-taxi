import '../models/payment_intent.dart';
import '../models/ride.dart';
import '../models/trip_draft.dart';
import 'api_client.dart';

class CreateRideResult {
  const CreateRideResult({
    required this.ride,
    this.paymentIntentId,
    this.payment,
  });

  final RideRecord ride;
  final String? paymentIntentId;
  final PaymentIntent? payment;
}

class RideService {
  RideService(this._client);

  final ApiClient _client;

  Future<CreateRideResult> createRide({
    required TripDraft trip,
    required String categoryCode,
    required String paymentMethodId,
    String? couponCode,
  }) async {
    final res = await _client.post('/v1/rides', body: {
      'categoryCode': categoryCode,
      'pickupLat': trip.pickupLat,
      'pickupLng': trip.pickupLng,
      'pickupAddress': trip.pickupAddress,
      'dropoffLat': trip.dropoffLat,
      'dropoffLng': trip.dropoffLng,
      'dropoffAddress': trip.dropoffAddress,
      if (trip.distanceKm != null) 'distanceKm': trip.distanceKm,
      if (trip.durationMin != null) 'durationMin': trip.durationMin,
      'paymentMethodId': paymentMethodId,
      if (couponCode != null && couponCode.isNotEmpty) 'couponCode': couponCode,
    });
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return CreateRideResult(
      ride: RideRecord.fromJson(data['ride'] as Map<String, dynamic>),
      paymentIntentId: data['paymentIntentId'] as String?,
      payment: data['payment'] != null
          ? PaymentIntent.fromJson(data['payment'] as Map<String, dynamic>)
          : null,
    );
  }

  Future<RideCompletion> fetchCompletion(String rideId) async {
    final res = await _client.get('/v1/rides/$rideId/completion');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return RideCompletion.fromJson(data['completion'] as Map<String, dynamic>);
  }

  Future<RideLifecycle> fetchLifecycle(String rideId) async {
    final res = await _client.get('/v1/rides/$rideId/lifecycle');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return RideLifecycle.fromJson(data['lifecycle'] as Map<String, dynamic>);
  }

  Future<RideTracking> fetchTracking(String rideId) async {
    final res = await _client.get('/v1/rides/$rideId/tracking');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return RideTracking.fromJson(data['tracking'] as Map<String, dynamic>);
  }

  Future<RideDetail> getRide(String rideId) async {
    final res = await _client.get('/v1/rides/$rideId');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return RideDetail.fromJson(data);
  }

  Future<CancellationPreview> fetchCancelPreview(String rideId, {String? reasonCode}) async {
    final query = reasonCode != null ? '?reasonCode=$reasonCode' : '';
    final res = await _client.get('/v1/rides/$rideId/cancel-preview$query');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return CancellationPreview.fromJson(data['preview'] as Map<String, dynamic>);
  }

  Future<RideRecord> cancelRide(String rideId, {String? reason, String? reasonCode}) async {
    final res = await _client.post('/v1/rides/$rideId/cancel', body: {
      if (reason != null) 'reason': reason,
      if (reasonCode != null) 'reasonCode': reasonCode,
    });
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return RideRecord.fromJson(data['ride'] as Map<String, dynamic>);
  }

  Future<RideRecord> verifyDriverCode(String rideId, String code) async {
    final res = await _client.post('/v1/rides/$rideId/verify-driver-code', body: {'code': code});
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    if (data['ride'] != null) {
      return RideRecord.fromJson(data['ride'] as Map<String, dynamic>);
    }
    return (await getRide(rideId)).ride;
  }

  Future<void> reissueCodes(String rideId) async {
    final res = await _client.post('/v1/rides/$rideId/reissue-codes');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
  }

  Future<RideReview> submitReview(String rideId, {required int stars, String? comment}) async {
    final res = await _client.post('/v1/rides/$rideId/review', body: {
      'stars': stars,
      if (comment != null && comment.isNotEmpty) 'comment': comment,
    });
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return RideReview.fromJson(data['review'] as Map<String, dynamic>);
  }
}
