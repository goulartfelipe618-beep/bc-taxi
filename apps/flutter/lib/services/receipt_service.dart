import '../config/api_config.dart';
import 'api_client.dart';

class RideReceipt {
  const RideReceipt({
    required this.id,
    required this.rideId,
    required this.receiptNumber,
    required this.amountCentavos,
    required this.amountLabel,
    required this.issuedAt,
    this.paymentMethodType,
  });

  final String id;
  final String rideId;
  final String receiptNumber;
  final int amountCentavos;
  final String amountLabel;
  final String issuedAt;
  final String? paymentMethodType;

  factory RideReceipt.fromJson(Map<String, dynamic> json) {
    return RideReceipt(
      id: json['id'] as String,
      rideId: json['rideId'] as String,
      receiptNumber: json['receiptNumber'] as String,
      amountCentavos: json['amountCentavos'] as int,
      amountLabel: json['amountLabel'] as String,
      issuedAt: json['issuedAt'] as String,
      paymentMethodType: json['paymentMethodType'] as String?,
    );
  }
}

class ReceiptService {
  ReceiptService(this._client);

  final ApiClient _client;

  Future<RideReceipt> fetchReceipt(String rideId) async {
    final res = await _client.get('/v1/receipts/rides/$rideId');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return RideReceipt.fromJson(data['receipt'] as Map<String, dynamic>);
  }

  Uri htmlUri(String rideId, String token) {
    return Uri.parse('$apiBaseUrl/v1/receipts/rides/$rideId/html');
  }
}
