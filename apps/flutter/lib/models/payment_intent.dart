class PixCharge {
  const PixCharge({
    required this.txid,
    required this.status,
    required this.qrCodePayload,
    required this.amountCentavos,
    required this.expiresAt,
    this.paidAt,
  });

  final String txid;
  final String status;
  final String qrCodePayload;
  final int amountCentavos;
  final String expiresAt;
  final String? paidAt;

  bool get isPaid => status == 'paid';

  String get amountLabel =>
      'R\$ ${(amountCentavos / 100).toStringAsFixed(2).replaceAll('.', ',')}';

  factory PixCharge.fromJson(Map<String, dynamic> json) {
    return PixCharge(
      txid: json['txid'] as String,
      status: json['status'] as String? ?? 'pending',
      qrCodePayload: json['qrCodePayload'] as String,
      amountCentavos: json['amountCentavos'] as int,
      expiresAt: json['expiresAt'] as String,
      paidAt: json['paidAt'] as String?,
    );
  }
}

class PaymentIntent {
  const PaymentIntent({
    required this.id,
    required this.status,
    required this.paymentMethodType,
    required this.amountAuthorizedCentavos,
    required this.amountCapturedCentavos,
    required this.currency,
    this.rideId,
    this.pix,
  });

  final String id;
  final String? rideId;
  final String status;
  final String paymentMethodType;
  final int amountAuthorizedCentavos;
  final int amountCapturedCentavos;
  final String currency;
  final PixCharge? pix;

  bool get needsPixAction => status == 'requires_action' || status == 'pending';
  bool get isAuthorized => status == 'authorized';
  bool get isCaptured => status == 'captured';
  bool get isFailed => status == 'failed';

  String get statusLabel {
    switch (status) {
      case 'requires_action':
      case 'pending':
        return 'Aguardando PIX';
      case 'authorized':
        return 'Pagamento confirmado';
      case 'captured':
        return 'Cobrança finalizada';
      case 'failed':
        return 'Pagamento falhou';
      case 'voided':
        return 'Cancelado';
      default:
        return status;
    }
  }

  factory PaymentIntent.fromJson(Map<String, dynamic> json) {
    return PaymentIntent(
      id: json['id'] as String,
      rideId: json['rideId'] as String?,
      status: json['status'] as String,
      paymentMethodType: json['paymentMethodType'] as String,
      amountAuthorizedCentavos: json['amountAuthorizedCentavos'] as int? ?? 0,
      amountCapturedCentavos: json['amountCapturedCentavos'] as int? ?? 0,
      currency: json['currency'] as String? ?? 'BRL',
      pix: json['pix'] != null ? PixCharge.fromJson(json['pix'] as Map<String, dynamic>) : null,
    );
  }
}
