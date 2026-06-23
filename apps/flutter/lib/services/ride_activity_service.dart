import 'api_client.dart';

class RideActivityItem {
  RideActivityItem({
    required this.rideId,
    required this.status,
    required this.categoryCode,
    required this.categoryLabel,
    required this.displayTitle,
    required this.dateLabel,
    this.pickupAddress,
    this.dropoffAddress,
    this.priceCentavos,
    this.priceLabel,
    this.driverName,
    this.passengerName,
    this.receiptAvailable = false,
    this.receiptId,
    this.reviewPending = false,
    this.isPinned = false,
  });

  final String rideId;
  final String status;
  final String categoryCode;
  final String categoryLabel;
  final String displayTitle;
  final String dateLabel;
  final String? pickupAddress;
  final String? dropoffAddress;
  final int? priceCentavos;
  final String? priceLabel;
  final String? driverName;
  final String? passengerName;
  final bool receiptAvailable;
  final String? receiptId;
  final bool reviewPending;
  final bool isPinned;

  bool get isCompleted => status == 'COMPLETED';
  bool get isCancelled => status == 'CANCELLED';

  factory RideActivityItem.fromJson(Map<String, dynamic> json) {
    return RideActivityItem(
      rideId: json['rideId'] as String,
      status: json['status'] as String,
      categoryCode: json['categoryCode'] as String,
      categoryLabel: json['categoryLabel'] as String? ?? json['categoryCode'] as String,
      displayTitle: json['displayTitle'] as String,
      dateLabel: json['dateLabel'] as String,
      pickupAddress: json['pickupAddress'] as String?,
      dropoffAddress: json['dropoffAddress'] as String?,
      priceCentavos: json['priceCentavos'] as int?,
      priceLabel: json['priceLabel'] as String?,
      driverName: json['driverName'] as String?,
      passengerName: json['passengerName'] as String?,
      receiptAvailable: json['receiptAvailable'] as bool? ?? false,
      receiptId: json['receiptId'] as String?,
      reviewPending: json['reviewPending'] as bool? ?? false,
      isPinned: json['isPinned'] as bool? ?? false,
    );
  }
}

class RideActivityListResult {
  RideActivityListResult({
    required this.items,
    required this.total,
    required this.hasMore,
  });

  final List<RideActivityItem> items;
  final int total;
  final bool hasMore;

  factory RideActivityListResult.fromJson(Map<String, dynamic> json) {
    final items = (json['items'] as List<dynamic>? ?? [])
        .map((i) => RideActivityItem.fromJson(i as Map<String, dynamic>))
        .toList();
    return RideActivityListResult(
      items: items,
      total: json['total'] as int? ?? items.length,
      hasMore: json['hasMore'] as bool? ?? false,
    );
  }
}

class RideActivityService {
  RideActivityService(this._client, {required this.role});

  final ApiClient _client;
  final String role;

  String get _basePath =>
      role == 'driver' ? '/v1/driver/activity' : '/v1/passenger/activity';

  Future<RideActivityListResult> fetchRides({String? status, int? limit}) async {
    final params = <String, String>{};
    if (status != null) params['status'] = status;
    if (limit != null) params['limit'] = '$limit';
    final query = params.entries.map((e) => '${Uri.encodeQueryComponent(e.key)}=${Uri.encodeQueryComponent(e.value)}').join('&');
    final path = query.isEmpty ? '$_basePath/rides' : '$_basePath/rides?$query';
    final res = await _client.get(path);
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return RideActivityListResult.fromJson(data);
  }

  Future<void> pinRide(String rideId) async {
    final res = await _client.post('$_basePath/rides/$rideId/pin');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
  }
}
