import 'api_client.dart';

class DriverReputationProfile {
  DriverReputationProfile({
    required this.score,
    required this.displayScore,
    required this.tier,
    required this.monitoring,
    this.operationallyBlocked = false,
    this.benefitsRevoked = false,
  });

  final double score;
  final double displayScore;
  final String tier;
  final bool monitoring;
  final bool operationallyBlocked;
  final bool benefitsRevoked;

  factory DriverReputationProfile.fromJson(Map<String, dynamic> json) {
    return DriverReputationProfile(
      score: (json['score'] as num).toDouble(),
      displayScore: (json['displayScore'] as num).toDouble(),
      tier: json['tier'] as String,
      monitoring: json['monitoring'] as bool? ?? false,
      operationallyBlocked: json['operationallyBlocked'] as bool? ?? false,
      benefitsRevoked: json['benefitsRevoked'] as bool? ?? false,
    );
  }
}

class DriverReputationKpis {
  DriverReputationKpis({
    required this.completedRides,
    required this.acceptanceRateLabel,
    required this.cancellationRateLabel,
    required this.reviewCount,
  });

  final int completedRides;
  final String acceptanceRateLabel;
  final String cancellationRateLabel;
  final int reviewCount;

  factory DriverReputationKpis.fromJson(Map<String, dynamic> json) {
    return DriverReputationKpis(
      completedRides: json['completedRides'] as int? ?? 0,
      acceptanceRateLabel: json['acceptanceRateLabel'] as String? ?? '—',
      cancellationRateLabel: json['cancellationRateLabel'] as String? ?? '—',
      reviewCount: json['reviewCount'] as int? ?? 0,
    );
  }
}

class DriverTierProgress {
  DriverTierProgress({
    required this.currentTier,
    required this.progressPct,
    this.nextTier,
    this.pointsToNext,
  });

  final String currentTier;
  final String? nextTier;
  final double? pointsToNext;
  final int progressPct;

  factory DriverTierProgress.fromJson(Map<String, dynamic> json) {
    return DriverTierProgress(
      currentTier: json['currentTier'] as String,
      nextTier: json['nextTier'] as String?,
      pointsToNext: (json['pointsToNext'] as num?)?.toDouble(),
      progressPct: json['progressPct'] as int? ?? 0,
    );
  }
}

class DriverReputationInsight {
  DriverReputationInsight({
    required this.code,
    required this.title,
    required this.body,
    required this.severity,
  });

  final String code;
  final String title;
  final String body;
  final String severity;

  factory DriverReputationInsight.fromJson(Map<String, dynamic> json) {
    return DriverReputationInsight(
      code: json['code'] as String,
      title: json['title'] as String,
      body: json['body'] as String,
      severity: json['severity'] as String? ?? 'info',
    );
  }
}

class DriverOperationalBreakdown {
  DriverOperationalBreakdown({
    required this.operationalStability,
    required this.pickupPunctuality,
    required this.routeAdherence,
    required this.documentQuality,
  });

  final double operationalStability;
  final double pickupPunctuality;
  final double routeAdherence;
  final double documentQuality;

  factory DriverOperationalBreakdown.fromJson(Map<String, dynamic> json) {
    return DriverOperationalBreakdown(
      operationalStability: (json['operationalStability'] as num).toDouble(),
      pickupPunctuality: (json['pickupPunctuality'] as num).toDouble(),
      routeAdherence: (json['routeAdherence'] as num).toDouble(),
      documentQuality: (json['documentQuality'] as num).toDouble(),
    );
  }
}

class DriverReputationDashboard {
  DriverReputationDashboard({
    required this.profile,
    this.kpis,
    this.tierProgress,
    required this.insights,
    required this.operationalBreakdown,
    required this.badges,
  });

  final DriverReputationProfile profile;
  final DriverReputationKpis? kpis;
  final DriverTierProgress? tierProgress;
  final List<DriverReputationInsight> insights;
  final DriverOperationalBreakdown operationalBreakdown;
  final List<Map<String, dynamic>> badges;

  factory DriverReputationDashboard.fromJson(Map<String, dynamic> json) {
    final insights = (json['insights'] as List<dynamic>? ?? [])
        .map((i) => DriverReputationInsight.fromJson(i as Map<String, dynamic>))
        .toList();
    final badges = (json['badges'] as List<dynamic>? ?? []).cast<Map<String, dynamic>>();
    return DriverReputationDashboard(
      profile: DriverReputationProfile.fromJson(json['profile'] as Map<String, dynamic>),
      kpis: json['kpis'] != null
          ? DriverReputationKpis.fromJson(json['kpis'] as Map<String, dynamic>)
          : null,
      tierProgress: json['tierProgress'] != null
          ? DriverTierProgress.fromJson(json['tierProgress'] as Map<String, dynamic>)
          : null,
      insights: insights,
      operationalBreakdown: DriverOperationalBreakdown.fromJson(
        json['operationalBreakdown'] as Map<String, dynamic>,
      ),
      badges: badges,
    );
  }
}

class DriverReputationService {
  DriverReputationService(this._client);

  final ApiClient _client;

  Future<DriverReputationDashboard> fetchDashboard() async {
    final res = await _client.get('/v1/driver/reputation/dashboard');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return DriverReputationDashboard.fromJson(data);
  }

  Future<void> dismissInsight(String code) async {
    final res = await _client.post('/v1/driver/reputation/insights/$code/dismiss');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
  }
}
