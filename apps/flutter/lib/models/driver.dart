class Driver {
  final String id;
  final String status;
  final bool isOnline;
  final double ratingAvg;
  final double? lat;
  final double? lng;

  Driver({
    required this.id,
    required this.status,
    required this.isOnline,
    required this.ratingAvg,
    this.lat,
    this.lng,
  });

  factory Driver.fromJson(Map<String, dynamic> json) => Driver(
        id: json['id'] as String,
        status: json['status'] as String,
        isOnline: json['is_online'] as bool,
        ratingAvg: (json['rating_avg'] as num).toDouble(),
        lat: json['lat'] != null ? (json['lat'] as num).toDouble() : null,
        lng: json['lng'] != null ? (json['lng'] as num).toDouble() : null,
      );
}
