import '../models/trip_draft.dart';
import 'mapbox_service.dart';

class TripResolver {
  static Future<TripDraft> buildFromMapPlaces({
    required MapPlace pickup,
    required MapPlace dropoff,
    List<MapPlace> stops = const [],
    bool scheduled = false,
    DateTime? scheduledAt,
  }) async {
    final route = await MapboxService.getDirections(
      fromLat: pickup.lat,
      fromLng: pickup.lng,
      toLat: dropoff.lat,
      toLng: dropoff.lng,
      waypoints: stops,
    );

    return TripDraft(
      pickupAddress: pickup.address,
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      dropoffName: dropoff.label,
      dropoffAddress: dropoff.address,
      dropoffLat: dropoff.lat,
      dropoffLng: dropoff.lng,
      stops: stops
          .map(
            (s) => TripStop(label: s.label, address: s.address, lat: s.lat, lng: s.lng),
          )
          .toList(),
      routePoints: route?.routePoints.toList() ?? const [],
      distanceKm: route?.distanceKm,
      durationMin: route?.durationMin,
      scheduled: scheduled,
      scheduledAt: scheduledAt,
    );
  }

  static Future<TripDraft> build({
    required String pickupAddress,
    required String dropoffName,
    required String dropoffAddress,
    bool scheduled = false,
    DateTime? scheduledAt,
  }) async {
    final pickup = await MapboxService.resolvePlace(pickupAddress);
    final dropoff = await MapboxService.resolvePlace('$dropoffName $dropoffAddress');

    final pickupPlace = pickup ??
        MapPlace(
          id: 'default-pickup',
          label: pickupAddress,
          address: pickupAddress,
          lat: defaultPickupLat,
          lng: defaultPickupLng,
        );
    final dropoffPlace = dropoff ??
        MapPlace(
          id: 'default-dropoff',
          label: dropoffName,
          address: dropoffAddress,
          lat: defaultDropoffLat,
          lng: defaultDropoffLng,
        );

    return buildFromMapPlaces(
      pickup: pickupPlace,
      dropoff: dropoffPlace,
      scheduled: scheduled,
      scheduledAt: scheduledAt,
    );
  }
}
