import '../models/ride.dart';
import 'api_client.dart';

class DriverService {
  DriverService(this._client);

  final ApiClient _client;

  Future<void> setOnline({
    required bool online,
    double? lat,
    double? lng,
    List<String>? enabledCategories,
  }) async {
    final res = await _client.post('/v1/driver/status', body: {
      'online': online,
      if (lat != null) 'lat': lat,
      if (lng != null) 'lng': lng,
      if (enabledCategories != null) 'enabledCategories': enabledCategories,
    });
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
  }

  Future<List<DriverOffer>> fetchOffers() async {
    final res = await _client.get('/v1/driver/offers');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    final list = (data['offers'] as List<dynamic>).cast<Map<String, dynamic>>();
    return list.where((o) => o['ride'] != null).map(DriverOffer.fromJson).toList();
  }

  Future<RideRecord> acceptOffer(String offerId) async {
    final res = await _client.post('/v1/driver/offers/$offerId/accept');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return RideRecord.fromJson(data['ride'] as Map<String, dynamic>);
  }

  Future<void> rejectOffer(String offerId) async {
    final res = await _client.post('/v1/driver/offers/$offerId/reject');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
  }

  Future<RideDetail> markArrived(String rideId) async {
    final res = await _client.post('/v1/rides/$rideId/arrived');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return RideDetail(
      ride: RideRecord.fromJson(data['ride'] as Map<String, dynamic>),
      verification: data['verification'] != null
          ? RideVerification.fromJson(data['verification'] as Map<String, dynamic>)
          : null,
      startCodes: data['startCodes'] != null
          ? StartCodes.fromJson(data['startCodes'] as Map<String, dynamic>)
          : data['codes'] != null
              ? StartCodes(
                  yours: (data['codes'] as Map<String, dynamic>)['driver'] as String,
                  partner: (data['codes'] as Map<String, dynamic>)['passenger'] as String,
                )
              : null,
    );
  }

  Future<RideRecord> verifyPassengerCode(String rideId, String code) async {
    final res = await _client.post('/v1/rides/$rideId/verify-passenger-code', body: {'code': code});
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    if (data['ride'] != null) {
      return RideRecord.fromJson(data['ride'] as Map<String, dynamic>);
    }
    return (await getRide(rideId)).ride;
  }

  Future<RideRecord> completeRide(String rideId) async {
    final res = await _client.post('/v1/rides/$rideId/complete');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return RideRecord.fromJson(data['ride'] as Map<String, dynamic>);
  }

  Future<RideDetail> getRide(String rideId) async {
    final res = await _client.get('/v1/rides/$rideId');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return RideDetail.fromJson(data);
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
