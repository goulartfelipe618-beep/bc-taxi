import 'api_client.dart';

class EnrichedScheduledRide {
  EnrichedScheduledRide({
    required this.id,
    required this.categoryCode,
    required this.categoryLabel,
    required this.scheduledAt,
    required this.scheduledLabel,
    required this.status,
    required this.statusLabel,
    required this.minutesUntilPickup,
    required this.canCancel,
    required this.canReschedule,
    this.pickupAddress,
    this.dropoffAddress,
    this.fareLabel,
    this.rideId,
  });

  final String id;
  final String categoryCode;
  final String categoryLabel;
  final String scheduledAt;
  final String scheduledLabel;
  final String status;
  final String statusLabel;
  final int minutesUntilPickup;
  final bool canCancel;
  final bool canReschedule;
  final String? pickupAddress;
  final String? dropoffAddress;
  final String? fareLabel;
  final String? rideId;

  factory EnrichedScheduledRide.fromJson(Map<String, dynamic> json) {
    return EnrichedScheduledRide(
      id: json['id'] as String,
      categoryCode: json['categoryCode'] as String,
      categoryLabel: json['categoryLabel'] as String? ?? json['categoryCode'] as String,
      scheduledAt: json['scheduledAt'] as String,
      scheduledLabel: json['scheduledLabel'] as String? ?? '',
      status: json['status'] as String,
      statusLabel: json['statusLabel'] as String? ?? json['status'] as String,
      minutesUntilPickup: json['minutesUntilPickup'] as int? ?? 0,
      canCancel: json['canCancel'] as bool? ?? false,
      canReschedule: json['canReschedule'] as bool? ?? false,
      pickupAddress: json['pickupAddress'] as String?,
      dropoffAddress: json['dropoffAddress'] as String?,
      fareLabel: json['fareLabel'] as String?,
      rideId: json['rideId'] as String?,
    );
  }
}

class PassengerScheduleDashboard {
  PassengerScheduleDashboard({
    required this.upcoming,
    required this.past,
    required this.reminders,
    required this.upcomingCount,
  });

  final List<EnrichedScheduledRide> upcoming;
  final List<EnrichedScheduledRide> past;
  final List<Map<String, dynamic>> reminders;
  final int upcomingCount;

  factory PassengerScheduleDashboard.fromJson(Map<String, dynamic> json) {
    final upcoming = (json['upcoming'] as List<dynamic>? ?? [])
        .map((s) => EnrichedScheduledRide.fromJson(s as Map<String, dynamic>))
        .toList();
    final past = (json['past'] as List<dynamic>? ?? [])
        .map((s) => EnrichedScheduledRide.fromJson(s as Map<String, dynamic>))
        .toList();
    final stats = json['stats'] as Map<String, dynamic>? ?? {};
    return PassengerScheduleDashboard(
      upcoming: upcoming,
      past: past,
      reminders: (json['reminders'] as List<dynamic>? ?? []).cast<Map<String, dynamic>>(),
      upcomingCount: stats['upcomingCount'] as int? ?? upcoming.length,
    );
  }
}

class PassengerScheduleProductionService {
  PassengerScheduleProductionService(this._client);

  final ApiClient _client;

  Future<PassengerScheduleDashboard> fetchDashboard() async {
    final res = await _client.get('/v1/passenger/schedules/dashboard');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return PassengerScheduleDashboard.fromJson(data);
  }

  Future<EnrichedScheduledRide> fetchDetail(String scheduleId) async {
    final res = await _client.get('/v1/passenger/schedules/$scheduleId');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return EnrichedScheduledRide.fromJson(data['schedule'] as Map<String, dynamic>);
  }

  Future<EnrichedScheduledRide> reschedule(String scheduleId, DateTime scheduledAt) async {
    final res = await _client.patch('/v1/passenger/schedules/$scheduleId/reschedule', body: {
      'scheduledAt': scheduledAt.toUtc().toIso8601String(),
    });
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return EnrichedScheduledRide.fromJson(data['schedule'] as Map<String, dynamic>);
  }

  Future<EnrichedScheduledRide> cancel(String scheduleId, {String? reason}) async {
    final res = await _client.post('/v1/passenger/schedules/$scheduleId/cancel', body: {
      if (reason != null) 'reason': reason,
    });
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return EnrichedScheduledRide.fromJson(data['schedule'] as Map<String, dynamic>);
  }
}
