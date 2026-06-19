import '../models/ride_category.dart';
import 'api_client.dart';

class PaymentMethod {
  const PaymentMethod({
    required this.id,
    required this.type,
    required this.label,
    required this.isDefault,
    this.lastFour,
    this.brand,
  });

  final String id;
  final String type;
  final String label;
  final bool isDefault;
  final String? lastFour;
  final String? brand;

  factory PaymentMethod.fromJson(Map<String, dynamic> json) {
    return PaymentMethod(
      id: json['id'] as String,
      type: json['type'] as String,
      label: json['label'] as String,
      isDefault: json['isDefault'] as bool? ?? false,
      lastFour: json['lastFour'] as String?,
      brand: json['brand'] as String?,
    );
  }
}

class PaymentService {
  PaymentService(this._client);

  final ApiClient _client;

  Future<List<PaymentMethod>> fetchMethods() async {
    final res = await _client.get('/v1/payments/methods');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    final list = (data['methods'] as List<dynamic>).cast<Map<String, dynamic>>();
    return list.map(PaymentMethod.fromJson).toList();
  }

  Future<RideQuote?> authorizeIntent({
    required String paymentMethodId,
    required int amountCentavos,
    String? rideId,
  }) async {
    final res = await _client.post('/v1/payments/intents/authorize', body: {
      'paymentMethodId': paymentMethodId,
      'amountCentavos': amountCentavos,
      if (rideId != null) 'rideId': rideId,
    });
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return null;
  }
}
