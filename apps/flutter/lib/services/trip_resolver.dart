import '../models/trip_draft.dart';
import 'mapbox_service.dart';

class TripResolver {
  static Future<TripDraft> build({
    required String pickupAddress,
    required String dropoffName,
    required String dropoffAddress,
    bool scheduled = false,
  }) async {
    final pickup = await MapboxService.resolvePlace(pickupAddress);
    final dropoff = await MapboxService.resolvePlace('$dropoffName $dropoffAddress');

    final pickupLat = pickup?.lat ?? defaultPickupLat;
    final pickupLng = pickup?.lng ?? defaultPickupLng;
    final dropoffLat = dropoff?.lat ?? defaultDropoffLat;
    final dropoffLng = dropoff?.lng ?? defaultDropoffLng;

    final route = await MapboxService.getDirections(
      fromLat: pickupLat,
      fromLng: pickupLng,
      toLat: dropoffLat,
      toLng: dropoffLng,
    );

    return TripDraft(
      pickupAddress: pickup?.address ?? pickupAddress,
      pickupLat: pickupLat,
      pickupLng: pickupLng,
      dropoffName: dropoff?.label ?? dropoffName,
      dropoffAddress: dropoff?.address ?? dropoffAddress,
      dropoffLat: dropoffLat,
      dropoffLng: dropoffLng,
      distanceKm: route?.distanceKm,
      durationMin: route?.durationMin,
      scheduled: scheduled,
    );
  }
}
