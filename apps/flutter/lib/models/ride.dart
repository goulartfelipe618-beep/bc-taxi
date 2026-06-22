import 'payment_intent.dart';

class RideVerification {
  const RideVerification({
    required this.passengerVerified,
    required this.driverVerified,
    required this.bothVerified,
    required this.expiresAt,
    required this.reissueCount,
    required this.maxReissues,
    this.cooldownUntil,
  });

  final bool passengerVerified;
  final bool driverVerified;
  final bool bothVerified;
  final String expiresAt;
  final int reissueCount;
  final int maxReissues;
  final String? cooldownUntil;

  factory RideVerification.fromJson(Map<String, dynamic> json) {
    return RideVerification(
      passengerVerified: json['passengerVerified'] as bool? ?? false,
      driverVerified: json['driverVerified'] as bool? ?? false,
      bothVerified: json['bothVerified'] as bool? ?? false,
      expiresAt: json['expiresAt'] as String? ?? '',
      reissueCount: json['reissueCount'] as int? ?? 0,
      maxReissues: json['maxReissues'] as int? ?? 3,
      cooldownUntil: json['cooldownUntil'] as String?,
    );
  }
}

class RideRecord {
  const RideRecord({
    required this.id,
    required this.passengerId,
    required this.categoryCode,
    required this.status,
    required this.statusLabel,
    required this.pickupLat,
    required this.pickupLng,
    required this.dropoffLat,
    required this.dropoffLng,
    this.driverId,
    this.pickupAddress,
    this.dropoffAddress,
    this.estimatedFareCentavos,
    this.paymentIntentId,
  });

  final String id;
  final String passengerId;
  final String? driverId;
  final String categoryCode;
  final String status;
  final String statusLabel;
  final double pickupLat;
  final double pickupLng;
  final double dropoffLat;
  final double dropoffLng;
  final String? pickupAddress;
  final String? dropoffAddress;
  final int? estimatedFareCentavos;
  final String? paymentIntentId;

  bool get isTerminal => status == 'COMPLETED' || status == 'CANCELLED' || status == 'NO_DRIVERS';
  bool get canCancel => status == 'REQUESTED' || status == 'OFFERING' || status == 'DRIVER_ASSIGNED';

  String get fareLabel {
    final cents = estimatedFareCentavos;
    if (cents == null) return '—';
    return 'R\$ ${(cents / 100).toStringAsFixed(2).replaceAll('.', ',')}';
  }

  factory RideRecord.fromJson(Map<String, dynamic> json) {
    return RideRecord(
      id: json['id'] as String,
      passengerId: json['passengerId'] as String,
      driverId: json['driverId'] as String?,
      categoryCode: json['categoryCode'] as String,
      status: json['status'] as String,
      statusLabel: json['statusLabel'] as String? ?? json['status'] as String,
      pickupLat: (json['pickupLat'] as num).toDouble(),
      pickupLng: (json['pickupLng'] as num).toDouble(),
      dropoffLat: (json['dropoffLat'] as num).toDouble(),
      dropoffLng: (json['dropoffLng'] as num).toDouble(),
      pickupAddress: json['pickupAddress'] as String?,
      dropoffAddress: json['dropoffAddress'] as String?,
      estimatedFareCentavos: json['estimatedFareCentavos'] as int?,
      paymentIntentId: json['paymentIntentId'] as String?,
    );
  }
}

class DriverLocation {
  const DriverLocation({required this.lat, required this.lng, this.updatedAt, this.heading});

  final double lat;
  final double lng;
  final String? updatedAt;
  final double? heading;

  factory DriverLocation.fromJson(Map<String, dynamic> json) {
    return DriverLocation(
      lat: (json['lat'] as num).toDouble(),
      lng: (json['lng'] as num).toDouble(),
      updatedAt: json['updatedAt'] as String?,
      heading: json['heading'] != null ? (json['heading'] as num).toDouble() : null,
    );
  }
}

class RideEta {
  const RideEta({required this.seconds, required this.label, required this.target});

  final int seconds;
  final String label;
  final String target;

  factory RideEta.fromJson(Map<String, dynamic> json) {
    return RideEta(
      seconds: json['seconds'] as int? ?? 0,
      label: json['label'] as String? ?? '—',
      target: json['target'] as String? ?? 'pickup',
    );
  }
}

class AssignedDriver {
  const AssignedDriver({
    required this.userId,
    required this.fullName,
    required this.rating,
    this.vehiclePlate,
    this.vehicleMake,
    this.vehicleModel,
  });

  final String userId;
  final String fullName;
  final double rating;
  final String? vehiclePlate;
  final String? vehicleMake;
  final String? vehicleModel;

  String get vehicleLabel {
    final parts = [vehicleMake, vehicleModel].whereType<String>().where((s) => s.isNotEmpty);
    final desc = parts.join(' ');
    if (vehiclePlate != null && vehiclePlate!.isNotEmpty) {
      return desc.isEmpty ? vehiclePlate! : '$desc · $vehiclePlate';
    }
    return desc.isEmpty ? 'Veículo' : desc;
  }

  factory AssignedDriver.fromJson(Map<String, dynamic> json) {
    return AssignedDriver(
      userId: json['userId'] as String,
      fullName: json['fullName'] as String,
      rating: (json['rating'] as num?)?.toDouble() ?? 5,
      vehiclePlate: json['vehiclePlate'] as String?,
      vehicleMake: json['vehicleMake'] as String?,
      vehicleModel: json['vehicleModel'] as String?,
    );
  }
}

class RideLifecycleWaitTimer {
  const RideLifecycleWaitTimer({
    required this.active,
    required this.elapsedSeconds,
    required this.includedMinutes,
    required this.billableMinutes,
    required this.estimatedFeeCentavos,
    required this.feeLabel,
  });

  final bool active;
  final int elapsedSeconds;
  final int includedMinutes;
  final int billableMinutes;
  final int estimatedFeeCentavos;
  final String feeLabel;

  factory RideLifecycleWaitTimer.fromJson(Map<String, dynamic> json) {
    return RideLifecycleWaitTimer(
      active: json['active'] as bool? ?? false,
      elapsedSeconds: json['elapsedSeconds'] as int? ?? 0,
      includedMinutes: json['includedMinutes'] as int? ?? 0,
      billableMinutes: json['billableMinutes'] as int? ?? 0,
      estimatedFeeCentavos: json['estimatedFeeCentavos'] as int? ?? 0,
      feeLabel: json['feeLabel'] as String? ?? '',
    );
  }

  String get elapsedLabel {
    final min = elapsedSeconds ~/ 60;
    final sec = elapsedSeconds % 60;
    if (min <= 0) return '${sec}s';
    return '${min}m ${sec.toString().padLeft(2, '0')}s';
  }
}

class RideLifecycle {
  const RideLifecycle({
    this.verification,
    this.waitTimer,
    this.pollIntervalMs,
  });

  final RideVerification? verification;
  final RideLifecycleWaitTimer? waitTimer;
  final int? pollIntervalMs;

  factory RideLifecycle.fromJson(Map<String, dynamic> json) {
    return RideLifecycle(
      verification: json['verification'] != null
          ? RideVerification.fromJson(json['verification'] as Map<String, dynamic>)
          : null,
      waitTimer: json['waitTimer'] != null
          ? RideLifecycleWaitTimer.fromJson(json['waitTimer'] as Map<String, dynamic>)
          : null,
      pollIntervalMs: json['pollIntervalMs'] as int?,
    );
  }
}

class RideTracking {
  const RideTracking({
    required this.driver,
    this.driverLocation,
    this.eta,
    this.distanceM,
    this.etaSource,
    this.pollIntervalMs,
    this.locationStale = false,
    this.route,
  });

  final AssignedDriver driver;
  final DriverLocation? driverLocation;
  final RideEta? eta;
  final int? distanceM;
  final String? etaSource;
  final int? pollIntervalMs;
  final bool locationStale;
  final ActiveRouteTracking? route;

  factory RideTracking.fromJson(Map<String, dynamic> json) {
    return RideTracking(
      driver: AssignedDriver.fromJson(json['driver'] as Map<String, dynamic>),
      driverLocation: json['driverLocation'] != null
          ? DriverLocation.fromJson(json['driverLocation'] as Map<String, dynamic>)
          : null,
      eta: json['eta'] != null ? RideEta.fromJson(json['eta'] as Map<String, dynamic>) : null,
      distanceM: json['distanceM'] as int?,
      etaSource: json['etaSource'] as String?,
      pollIntervalMs: json['pollIntervalMs'] as int?,
      locationStale: json['locationStale'] as bool? ?? false,
      route: json['route'] != null
          ? ActiveRouteTracking.fromJson(json['route'] as Map<String, dynamic>)
          : null,
    );
  }
}

class ActiveRouteTracking {
  const ActiveRouteTracking({
    required this.etaSeconds,
    required this.distanceM,
    this.routePolyline,
    this.deviationM,
    this.strategy,
  });

  final int etaSeconds;
  final int distanceM;
  final Map<String, dynamic>? routePolyline;
  final double? deviationM;
  final String? strategy;

  List<LatLngPoint> get polylinePoints {
    final geometry = routePolyline;
    if (geometry == null) return [];
    final coords = geometry['coordinates'] as List<dynamic>?;
    if (coords == null) return [];
    return coords
        .map((c) {
          final pair = c as List<dynamic>;
          return LatLngPoint((pair[1] as num).toDouble(), (pair[0] as num).toDouble());
        })
        .toList();
  }

  factory ActiveRouteTracking.fromJson(Map<String, dynamic> json) {
    return ActiveRouteTracking(
      etaSeconds: json['etaSeconds'] as int? ?? 0,
      distanceM: json['distanceM'] as int? ?? 0,
      routePolyline: json['routePolyline'] as Map<String, dynamic>?,
      deviationM: (json['deviationM'] as num?)?.toDouble(),
      strategy: json['strategy'] as String?,
    );
  }
}

class LatLngPoint {
  const LatLngPoint(this.lat, this.lng);
  final double lat;
  final double lng;
}

class RideCompletionFare {
  const RideCompletionFare({
    required this.baseFareCentavos,
    required this.waitFeeCentavos,
    required this.totalCentavos,
    required this.totalLabel,
    required this.fareSource,
    this.routeDistanceM,
    this.tripDurationS,
  });

  final int baseFareCentavos;
  final int waitFeeCentavos;
  final int totalCentavos;
  final String totalLabel;
  final String fareSource;
  final int? routeDistanceM;
  final int? tripDurationS;

  factory RideCompletionFare.fromJson(Map<String, dynamic> json) {
    return RideCompletionFare(
      baseFareCentavos: json['baseFareCentavos'] as int? ?? 0,
      waitFeeCentavos: json['waitFeeCentavos'] as int? ?? 0,
      totalCentavos: json['totalCentavos'] as int? ?? 0,
      totalLabel: json['totalLabel'] as String? ?? '',
      fareSource: json['fareSource'] as String? ?? 'estimated',
      routeDistanceM: json['routeDistanceM'] as int?,
      tripDurationS: json['tripDurationS'] as int?,
    );
  }
}

class RideCompletion {
  const RideCompletion({
    required this.fare,
    this.reviewPending = false,
    this.reviewExpiresAt,
    this.pollIntervalMs,
  });

  final RideCompletionFare fare;
  final bool reviewPending;
  final String? reviewExpiresAt;
  final int? pollIntervalMs;

  factory RideCompletion.fromJson(Map<String, dynamic> json) {
    return RideCompletion(
      fare: RideCompletionFare.fromJson(json['fare'] as Map<String, dynamic>),
      reviewPending: json['reviewPending'] as bool? ?? false,
      reviewExpiresAt: json['reviewExpiresAt'] as String?,
      pollIntervalMs: json['pollIntervalMs'] as int?,
    );
  }
}

class RideDetail {
  const RideDetail({
    required this.ride,
    this.verification,
    this.startCodes,
    this.tracking,
    this.lifecycle,
    this.completion,
    this.payment,
  });

  final RideRecord ride;
  final RideVerification? verification;
  final StartCodes? startCodes;
  final RideTracking? tracking;
  final RideLifecycle? lifecycle;
  final RideCompletion? completion;
  final PaymentIntent? payment;

  factory RideDetail.fromJson(Map<String, dynamic> json) {
    return RideDetail(
      ride: RideRecord.fromJson(json['ride'] as Map<String, dynamic>),
      verification: json['verification'] != null
          ? RideVerification.fromJson(json['verification'] as Map<String, dynamic>)
          : null,
      startCodes: json['startCodes'] != null
          ? StartCodes.fromJson(json['startCodes'] as Map<String, dynamic>)
          : null,
      tracking: json['tracking'] != null
          ? RideTracking.fromJson(json['tracking'] as Map<String, dynamic>)
          : null,
      lifecycle: json['lifecycle'] != null
          ? RideLifecycle.fromJson(json['lifecycle'] as Map<String, dynamic>)
          : null,
      completion: json['completion'] != null
          ? RideCompletion.fromJson(json['completion'] as Map<String, dynamic>)
          : null,
      payment: json['payment'] != null
          ? PaymentIntent.fromJson(json['payment'] as Map<String, dynamic>)
          : null,
    );
  }
}

class StartCodes {
  const StartCodes({required this.yours, required this.partner});

  final String yours;
  final String partner;

  factory StartCodes.fromJson(Map<String, dynamic> json) {
    return StartCodes(
      yours: json['yours'] as String,
      partner: json['partner'] as String,
    );
  }
}

class DriverOffer {
  const DriverOffer({
    required this.offerId,
    required this.ride,
    required this.expiresAt,
  });

  final String offerId;
  final RideRecord ride;
  final String expiresAt;

  factory DriverOffer.fromJson(Map<String, dynamic> json) {
    final offer = json['offer'] as Map<String, dynamic>;
    return DriverOffer(
      offerId: offer['id'] as String,
      ride: RideRecord.fromJson(json['ride'] as Map<String, dynamic>),
      expiresAt: offer['expiresAt'] as String,
    );
  }
}

class RideReview {
  const RideReview({
    required this.id,
    required this.stars,
    this.comment,
  });

  final String id;
  final int stars;
  final String? comment;

  factory RideReview.fromJson(Map<String, dynamic> json) {
    return RideReview(
      id: json['id'] as String,
      stars: json['stars'] as int,
      comment: json['comment'] as String?,
    );
  }
}
