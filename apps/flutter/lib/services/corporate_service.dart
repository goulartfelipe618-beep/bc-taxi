import 'api_client.dart';

class CorporateAccountInfo {
  const CorporateAccountInfo({
    required this.accountId,
    required this.accountName,
    required this.costCenters,
    required this.allowedCategoryCodes,
    this.maxFareCentavos,
  });

  final String accountId;
  final String accountName;
  final List<CorporateCostCenter> costCenters;
  final List<String> allowedCategoryCodes;
  final int? maxFareCentavos;

  factory CorporateAccountInfo.fromJson(Map<String, dynamic> json) {
    final account = json['account'] as Map<String, dynamic>;
    final policy = json['policy'] as Map<String, dynamic>;
    final centers = (json['costCenters'] as List<dynamic>).cast<Map<String, dynamic>>();
    return CorporateAccountInfo(
      accountId: account['id'] as String,
      accountName: account['name'] as String,
      costCenters: centers.map(CorporateCostCenter.fromJson).toList(),
      allowedCategoryCodes: (policy['allowedCategoryCodes'] as List<dynamic>).cast<String>(),
      maxFareCentavos: policy['maxFareCentavos'] as int?,
    );
  }
}

class CorporateCostCenter {
  const CorporateCostCenter({required this.id, required this.code, required this.label});

  final String id;
  final String code;
  final String label;

  factory CorporateCostCenter.fromJson(Map<String, dynamic> json) {
    return CorporateCostCenter(
      id: json['id'] as String,
      code: json['code'] as String,
      label: json['label'] as String,
    );
  }
}

class CorporateService {
  CorporateService(this._client);

  final ApiClient _client;

  Future<CorporateAccountInfo> fetchAccount() async {
    final res = await _client.get('/v1/corporate/account');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return CorporateAccountInfo.fromJson(data);
  }

  Future<Map<String, dynamic>> book({
    required String accountId,
    required String costCenterId,
    required String categoryCode,
    required double pickupLat,
    required double pickupLng,
    required double dropoffLat,
    required double dropoffLng,
    String? pickupAddress,
    String? dropoffAddress,
    double? distanceKm,
    double? durationMin,
  }) async {
    final res = await _client.post('/v1/corporate/book', body: {
      'accountId': accountId,
      'costCenterId': costCenterId,
      'categoryCode': categoryCode,
      'pickupLat': pickupLat,
      'pickupLng': pickupLng,
      'dropoffLat': dropoffLat,
      'dropoffLng': dropoffLng,
      if (pickupAddress != null) 'pickupAddress': pickupAddress,
      if (dropoffAddress != null) 'dropoffAddress': dropoffAddress,
      if (distanceKm != null) 'distanceKm': distanceKm,
      if (durationMin != null) 'durationMin': durationMin,
    });
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return data;
  }
}
