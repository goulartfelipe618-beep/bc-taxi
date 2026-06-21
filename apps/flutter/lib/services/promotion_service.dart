import 'api_client.dart';

class PromoValidation {
  const PromoValidation({
    required this.valid,
    required this.discountCentavos,
    required this.fareAfterCentavos,
    this.label,
    this.reason,
  });

  final bool valid;
  final int discountCentavos;
  final int fareAfterCentavos;
  final String? label;
  final String? reason;

  factory PromoValidation.fromJson(Map<String, dynamic> json) {
    return PromoValidation(
      valid: json['valid'] as bool? ?? false,
      discountCentavos: json['discountCentavos'] as int? ?? 0,
      fareAfterCentavos: json['fareAfterCentavos'] as int? ?? 0,
      label: json['label'] as String?,
      reason: json['reason'] as String?,
    );
  }
}

class PromoEligibility {
  const PromoEligibility({
    required this.abuseScore,
    required this.promoEligibilityFactor,
    required this.eligible,
    this.blockedUntil,
  });

  final double abuseScore;
  final double promoEligibilityFactor;
  final bool eligible;
  final String? blockedUntil;

  factory PromoEligibility.fromJson(Map<String, dynamic> json) {
    return PromoEligibility(
      abuseScore: (json['abuseScore'] as num?)?.toDouble() ?? 0,
      promoEligibilityFactor: (json['promoEligibilityFactor'] as num?)?.toDouble() ?? 1,
      eligible: json['eligible'] as bool? ?? true,
      blockedUntil: json['blockedUntil'] as String?,
    );
  }
}

class PromotionService {
  PromotionService(this._client);

  final ApiClient _client;

  Future<PromoEligibility> fetchEligibility() async {
    final res = await _client.get('/v1/promotions/eligibility');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    final eligibility = data['eligibility'] as Map<String, dynamic>? ?? data;
    return PromoEligibility.fromJson(eligibility);
  }

  Future<PromoValidation> validate({
    required String code,
    required String categoryCode,
    required int fareCentavos,
    String? paymentMethodId,
  }) async {
    final res = await _client.post(
      '/v1/promotions/validate',
      body: {
        'code': code,
        'categoryCode': categoryCode,
        'fareCentavos': fareCentavos,
        if (paymentMethodId != null) 'paymentMethodId': paymentMethodId,
      },
    );
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return PromoValidation.fromJson(data);
  }
}
