class TripStop {
  const TripStop({
    required this.label,
    required this.address,
    required this.lat,
    required this.lng,
  });

  final String label;
  final String address;
  final double lat;
  final double lng;
}

class RoutePoint {
  const RoutePoint({required this.lat, required this.lng});

  final double lat;
  final double lng;
}

class TripDraft {
  const TripDraft({
    required this.pickupAddress,
    required this.pickupLat,
    required this.pickupLng,
    required this.dropoffName,
    required this.dropoffAddress,
    required this.dropoffLat,
    required this.dropoffLng,
    this.stops = const [],
    this.routePoints = const [],
    this.distanceKm,
    this.durationMin,
    this.scheduled = false,
    this.scheduledAt,
  });

  final String pickupAddress;
  final double pickupLat;
  final double pickupLng;
  final String dropoffName;
  final String dropoffAddress;
  final double dropoffLat;
  final double dropoffLng;
  final List<TripStop> stops;
  final List<RoutePoint> routePoints;
  final double? distanceKm;
  final double? durationMin;
  final bool scheduled;
  final DateTime? scheduledAt;

  TripDraft copyWith({
    double? distanceKm,
    double? durationMin,
    List<TripStop>? stops,
    List<RoutePoint>? routePoints,
    DateTime? scheduledAt,
  }) {
    return TripDraft(
      pickupAddress: pickupAddress,
      pickupLat: pickupLat,
      pickupLng: pickupLng,
      dropoffName: dropoffName,
      dropoffAddress: dropoffAddress,
      dropoffLat: dropoffLat,
      dropoffLng: dropoffLng,
      stops: stops ?? this.stops,
      routePoints: routePoints ?? this.routePoints,
      distanceKm: distanceKm ?? this.distanceKm,
      durationMin: durationMin ?? this.durationMin,
      scheduled: scheduled,
      scheduledAt: scheduledAt ?? this.scheduledAt,
    );
  }
}

/// Coordenadas padrão — região Blumenau / BC.
const defaultPickupLat = -26.9194;
const defaultPickupLng = -49.0661;
const defaultDropoffLat = -26.9905;
const defaultDropoffLng = -48.6348;

/// UUIDs demo alinhados com a API.
const demoPaymentMethodIds = {
  'pix': '00000000-0000-4000-8000-000000000001',
  'card': '00000000-0000-4000-8000-000000000002',
  'debit': '00000000-0000-4000-8000-000000000003',
  'cash': '00000000-0000-4000-8000-000000000004',
};

String paymentMethodIdForLabel(String label) {
  final lower = label.toLowerCase();
  if (lower.contains('dinheiro') || lower.contains('cash')) return demoPaymentMethodIds['cash']!;
  if (lower.contains('débito') || lower.contains('debit')) return demoPaymentMethodIds['debit']!;
  if (lower.contains('cartão') || lower.contains('card') || lower.contains('4242')) {
    return demoPaymentMethodIds['card']!;
  }
  return demoPaymentMethodIds['pix']!;
}
