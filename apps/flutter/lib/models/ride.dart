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

class RideDetail {
  const RideDetail({required this.ride, this.verification, this.startCodes});

  final RideRecord ride;
  final RideVerification? verification;
  final StartCodes? startCodes;

  factory RideDetail.fromJson(Map<String, dynamic> json) {
    return RideDetail(
      ride: RideRecord.fromJson(json['ride'] as Map<String, dynamic>),
      verification: json['verification'] != null
          ? RideVerification.fromJson(json['verification'] as Map<String, dynamic>)
          : null,
      startCodes: json['startCodes'] != null
          ? StartCodes.fromJson(json['startCodes'] as Map<String, dynamic>)
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
