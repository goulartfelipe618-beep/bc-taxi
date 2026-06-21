import '../models/payment_intent.dart';
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

  bool get isPix => type == 'pix';

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

  Future<Map<String, dynamic>> fetchConfig() async {
    final res = await _client.get('/v1/payments/config');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return data;
  }

  Future<List<PaymentMethod>> fetchMethods() async {
    final res = await _client.get('/v1/payments/methods');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    final list = (data['methods'] as List<dynamic>).cast<Map<String, dynamic>>();
    return list.map(PaymentMethod.fromJson).toList();
  }

  Future<PaymentMethod> tokenizeCard({
    required String providerToken,
    String methodType = 'card',
    String? lastFour,
    String? brand,
    bool setDefault = false,
  }) async {
    final res = await _client.post('/v1/payments/methods/tokenize', body: {
      'methodType': methodType,
      'providerToken': providerToken,
      if (lastFour != null) 'lastFour': lastFour,
      if (brand != null) 'brand': brand,
      'setDefault': setDefault,
    });
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return PaymentMethod.fromJson(data['method'] as Map<String, dynamic>);
  }

  Future<PaymentIntent> authorizeIntent({
    required String paymentMethodId,
    required int amountCentavos,
    String? rideId,
    String? idempotencyKey,
  }) async {
    final res = await _client.post('/v1/payments/intents/authorize', body: {
      'paymentMethodId': paymentMethodId,
      'amountCentavos': amountCentavos,
      if (rideId != null) 'rideId': rideId,
      if (idempotencyKey != null) 'idempotencyKey': idempotencyKey,
    });
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return PaymentIntent.fromJson(data['intent'] as Map<String, dynamic>);
  }

  Future<PaymentIntent> fetchIntent(String intentId) async {
    final res = await _client.get('/v1/payments/intents/$intentId');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return PaymentIntent.fromJson(data['intent'] as Map<String, dynamic>);
  }

  Future<PaymentIntent> pollUntilAuthorized(
    String intentId, {
    Duration timeout = const Duration(minutes: 5),
    Duration interval = const Duration(seconds: 3),
  }) async {
    final deadline = DateTime.now().add(timeout);
    while (DateTime.now().isBefore(deadline)) {
      final intent = await fetchIntent(intentId);
      if (intent.isAuthorized || intent.isCaptured) return intent;
      if (intent.isFailed) throw ApiException('Pagamento recusado', 402);
      await Future<void>.delayed(interval);
    }
    throw ApiException('Tempo esgotado aguardando pagamento PIX', 408);
  }

  Future<void> simulatePixPaid(String txid) async {
    final res = await _client.post('/v1/payments/pix/$txid/simulate-paid');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
  }
}

PaymentIntent? parsePaymentPayload(Map<String, dynamic>? json) {
  if (json == null) return null;
  return PaymentIntent.fromJson(json);
}
