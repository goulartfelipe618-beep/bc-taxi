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

class PromotionService {
  PromotionService(this._client);

  final ApiClient _client;

  Future<PromoValidation> validate({
    required String code,
    required String categoryCode,
    required int fareCentavos,
  }) async {
    final res = await _client.post('/v1/promotions/validate', body: {
      'code': code,
      'categoryCode': categoryCode,
      'fareCentavos': fareCentavos,
    });
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return PromoValidation.fromJson(data);
  }
}
