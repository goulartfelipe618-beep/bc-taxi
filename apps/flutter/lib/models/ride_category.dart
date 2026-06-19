class ApiRideCategory {
  const ApiRideCategory({
    required this.code,
    required this.name,
    required this.description,
    required this.passengerLimitMax,
    required this.isPremium,
    required this.requiresScheduling,
    required this.baggagePolicy,
  });

  final String code;
  final String name;
  final String description;
  final int passengerLimitMax;
  final bool isPremium;
  final bool requiresScheduling;
  final String baggagePolicy;

  factory ApiRideCategory.fromJson(Map<String, dynamic> json) {
    return ApiRideCategory(
      code: json['code'] as String,
      name: json['name'] as String,
      description: json['description'] as String? ?? '',
      passengerLimitMax: json['passengerLimitMax'] as int? ?? 4,
      isPremium: json['isPremium'] as bool? ?? false,
      requiresScheduling: json['requiresScheduling'] as bool? ?? false,
      baggagePolicy: json['baggagePolicy'] as String? ?? '',
    );
  }
}

class RideQuote {
  const RideQuote({
    required this.categoryCode,
    required this.categoryName,
    required this.passengerFareLabel,
    required this.passengerFareCentavos,
  });

  final String categoryCode;
  final String categoryName;
  final String passengerFareLabel;
  final int passengerFareCentavos;

  factory RideQuote.fromJson(Map<String, dynamic> json) {
    return RideQuote(
      categoryCode: json['categoryCode'] as String,
      categoryName: json['categoryName'] as String,
      passengerFareLabel: json['passengerFareLabel'] as String,
      passengerFareCentavos: json['passengerFareCentavos'] as int,
    );
  }
}
