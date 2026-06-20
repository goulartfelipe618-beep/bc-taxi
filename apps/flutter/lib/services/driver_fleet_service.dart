import 'api_client.dart';

class DriverCompliance {
  const DriverCompliance({
    required this.canOperate,
    required this.blockReasons,
    required this.cnhValid,
    required this.vehicleDocsValid,
    required this.hasActiveVehicle,
    required this.enabledCategories,
    this.activeVehiclePlate,
    this.driverDocuments = const [],
    this.vehicleDocuments = const [],
  });

  final bool canOperate;
  final List<String> blockReasons;
  final bool cnhValid;
  final bool vehicleDocsValid;
  final bool hasActiveVehicle;
  final List<String> enabledCategories;
  final String? activeVehiclePlate;
  final List<Map<String, dynamic>> driverDocuments;
  final List<Map<String, dynamic>> vehicleDocuments;

  factory DriverCompliance.fromJson(Map<String, dynamic> json) {
    final c = json['compliance'] as Map<String, dynamic>? ?? json;
    return DriverCompliance(
      canOperate: c['canOperate'] as bool? ?? false,
      blockReasons: (c['blockReasons'] as List<dynamic>? ?? []).cast<String>(),
      cnhValid: c['cnhValid'] as bool? ?? false,
      vehicleDocsValid: c['vehicleDocsValid'] as bool? ?? false,
      hasActiveVehicle: c['hasActiveVehicle'] as bool? ?? false,
      enabledCategories: (c['enabledCategories'] as List<dynamic>? ?? []).cast<String>(),
      activeVehiclePlate: (c['activeVehicle'] as Map<String, dynamic>?)?['plate'] as String?,
      driverDocuments: (c['driverDocuments'] as List<dynamic>? ?? []).cast<Map<String, dynamic>>(),
      vehicleDocuments: (c['vehicleDocuments'] as List<dynamic>? ?? []).cast<Map<String, dynamic>>(),
    );
  }
}

class DriverFleetService {
  DriverFleetService(this._client);

  final ApiClient _client;

  Future<DriverCompliance> fetchCompliance() async {
    final res = await _client.get('/v1/driver/fleet/compliance');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return DriverCompliance.fromJson(data);
  }

  Future<void> registerVehicle({
    required String plate,
    required String make,
    required String model,
    required int year,
    List<String>? categoryCodes,
  }) async {
    final res = await _client.post('/v1/driver/fleet/vehicles', body: {
      'plate': plate,
      'make': make,
      'model': model,
      'year': year,
      if (categoryCodes != null) 'categoryCodes': categoryCodes,
    });
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
  }

  Future<void> submitDriverDocument({
    required String docType,
    String? expiresAt,
  }) async {
    final res = await _client.post('/v1/driver/fleet/documents', body: {
      'docType': docType,
      'status': 'approved',
      if (expiresAt != null) 'expiresAt': expiresAt,
    });
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
  }

  Future<String> fetchPrimaryVehicleId() async {
    final res = await _client.get('/v1/driver/fleet/vehicles');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    final list = (data['vehicles'] as List<dynamic>).cast<Map<String, dynamic>>();
    if (list.isEmpty) throw Exception('Nenhum veículo cadastrado');
    return list.first['id'] as String;
  }

  Future<void> submitVehicleDocument({
    required String vehicleId,
    required String docType,
    String? expiresAt,
  }) async {
    final res = await _client.post('/v1/driver/fleet/vehicles/$vehicleId/documents', body: {
      'docType': docType,
      'status': 'approved',
      if (expiresAt != null) 'expiresAt': expiresAt,
    });
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
  }
}
