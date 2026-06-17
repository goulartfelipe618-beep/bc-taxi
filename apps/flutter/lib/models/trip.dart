class Trip {
  final String id;
  final String passengerId;
  final String? driverId;
  final String vehicleType;
  final String status;
  final String? pickupAddress;
  final double pickupLat;
  final double pickupLng;
  final String? dropoffAddress;
  final double dropoffLat;
  final double dropoffLng;
  final double? estimatedPrice;
  final double? finalPrice;
  final int? distanceMeters;
  final int? durationSeconds;
  final String createdAt;

  Trip({
    required this.id,
    required this.passengerId,
    this.driverId,
    required this.vehicleType,
    required this.status,
    this.pickupAddress,
    required this.pickupLat,
    required this.pickupLng,
    this.dropoffAddress,
    required this.dropoffLat,
    required this.dropoffLng,
    this.estimatedPrice,
    this.finalPrice,
    this.distanceMeters,
    this.durationSeconds,
    required this.createdAt,
  });

  factory Trip.fromJson(Map<String, dynamic> json) => Trip(
        id: json['id'] as String,
        passengerId: json['passenger_id'] as String,
        driverId: json['driver_id'] as String?,
        vehicleType: json['vehicle_type'] as String,
        status: json['status'] as String,
        pickupAddress: json['pickup_address'] as String?,
        pickupLat: (json['pickup_lat'] as num).toDouble(),
        pickupLng: (json['pickup_lng'] as num).toDouble(),
        dropoffAddress: json['dropoff_address'] as String?,
        dropoffLat: (json['dropoff_lat'] as num).toDouble(),
        dropoffLng: (json['dropoff_lng'] as num).toDouble(),
        estimatedPrice: json['estimated_price'] != null
            ? (json['estimated_price'] as num).toDouble()
            : null,
        finalPrice: json['final_price'] != null
            ? (json['final_price'] as num).toDouble()
            : null,
        distanceMeters: json['distance_meters'] as int?,
        durationSeconds: json['duration_seconds'] as int?,
        createdAt: json['created_at'] as String,
      );

  bool get isActive => !['completed', 'cancelled'].contains(status);

  double? get displayPrice => finalPrice ?? estimatedPrice;
}
