import 'api_client.dart';

class PassengerReputationProfile {
  PassengerReputationProfile({
    required this.score,
    required this.displayScore,
    required this.tier,
    required this.monitoring,
    this.prepayRequired = false,
    this.cashAllowed = true,
    this.benefitsRevoked = false,
  });

  final double score;
  final double displayScore;
  final String tier;
  final bool monitoring;
  final bool prepayRequired;
  final bool cashAllowed;
  final bool benefitsRevoked;

  factory PassengerReputationProfile.fromJson(Map<String, dynamic> json) {
    return PassengerReputationProfile(
      score: (json['score'] as num).toDouble(),
      displayScore: (json['displayScore'] as num).toDouble(),
      tier: json['tier'] as String,
      monitoring: json['monitoring'] as bool? ?? false,
      prepayRequired: json['prepayRequired'] as bool? ?? false,
      cashAllowed: json['cashAllowed'] as bool? ?? true,
      benefitsRevoked: json['benefitsRevoked'] as bool? ?? false,
    );
  }
}

class PassengerReputationKpis {
  PassengerReputationKpis({
    required this.completedRides,
    required this.paymentSuccessLabel,
    required this.lateCancelLabel,
    required this.reviewCount,
  });

  final int completedRides;
  final String paymentSuccessLabel;
  final String lateCancelLabel;
  final int reviewCount;

  factory PassengerReputationKpis.fromJson(Map<String, dynamic> json) {
    return PassengerReputationKpis(
      completedRides: json['completedRides'] as int? ?? 0,
      paymentSuccessLabel: json['paymentSuccessLabel'] as String? ?? '—',
      lateCancelLabel: json['lateCancelLabel'] as String? ?? '—',
      reviewCount: json['reviewCount'] as int? ?? 0,
    );
  }
}

class PassengerTierProgress {
  PassengerTierProgress({
    required this.currentTier,
    required this.progressPct,
    this.nextTier,
    this.pointsToNext,
  });

  final String currentTier;
  final String? nextTier;
  final double? pointsToNext;
  final int progressPct;

  factory PassengerTierProgress.fromJson(Map<String, dynamic> json) {
    return PassengerTierProgress(
      currentTier: json['currentTier'] as String,
      nextTier: json['nextTier'] as String?,
      pointsToNext: (json['pointsToNext'] as num?)?.toDouble(),
      progressPct: json['progressPct'] as int? ?? 0,
    );
  }
}

class PassengerReputationInsight {
  PassengerReputationInsight({
    required this.code,
    required this.title,
    required this.body,
    required this.severity,
  });

  final String code;
  final String title;
  final String body;
  final String severity;

  factory PassengerReputationInsight.fromJson(Map<String, dynamic> json) {
    return PassengerReputationInsight(
      code: json['code'] as String,
      title: json['title'] as String,
      body: json['body'] as String,
      severity: json['severity'] as String? ?? 'info',
    );
  }
}

class PassengerOperationalBreakdown {
  PassengerOperationalBreakdown({
    required this.boardingPresence,
    required this.paymentSuccess,
    required this.lateCancelIndex,
    required this.behaviorIndex,
  });

  final double boardingPresence;
  final double paymentSuccess;
  final double lateCancelIndex;
  final double behaviorIndex;

  factory PassengerOperationalBreakdown.fromJson(Map<String, dynamic> json) {
    return PassengerOperationalBreakdown(
      boardingPresence: (json['boardingPresence'] as num).toDouble(),
      paymentSuccess: (json['paymentSuccess'] as num).toDouble(),
      lateCancelIndex: (json['lateCancelIndex'] as num).toDouble(),
      behaviorIndex: (json['behaviorIndex'] as num).toDouble(),
    );
  }
}

class PassengerReputationDashboard {
  PassengerReputationDashboard({
    required this.profile,
    this.kpis,
    this.tierProgress,
    required this.insights,
    required this.operationalBreakdown,
    required this.badges,
    this.benefits,
  });

  final PassengerReputationProfile profile;
  final PassengerReputationKpis? kpis;
  final PassengerTierProgress? tierProgress;
  final List<PassengerReputationInsight> insights;
  final PassengerOperationalBreakdown operationalBreakdown;
  final List<Map<String, dynamic>> badges;
  final Map<String, dynamic>? benefits;

  factory PassengerReputationDashboard.fromJson(Map<String, dynamic> json) {
    final insights = (json['insights'] as List<dynamic>? ?? [])
        .map((i) => PassengerReputationInsight.fromJson(i as Map<String, dynamic>))
        .toList();
    final badges = (json['badges'] as List<dynamic>? ?? []).cast<Map<String, dynamic>>();
    return PassengerReputationDashboard(
      profile: PassengerReputationProfile.fromJson(json['profile'] as Map<String, dynamic>),
      kpis: json['kpis'] != null
          ? PassengerReputationKpis.fromJson(json['kpis'] as Map<String, dynamic>)
          : null,
      tierProgress: json['tierProgress'] != null
          ? PassengerTierProgress.fromJson(json['tierProgress'] as Map<String, dynamic>)
          : null,
      insights: insights,
      operationalBreakdown: PassengerOperationalBreakdown.fromJson(
        json['operationalBreakdown'] as Map<String, dynamic>,
      ),
      badges: badges,
      benefits: json['benefits'] as Map<String, dynamic>?,
    );
  }
}

class PassengerReputationService {
  PassengerReputationService(this._client);

  final ApiClient _client;

  Future<PassengerReputationDashboard> fetchDashboard() async {
    final res = await _client.get('/v1/passenger/reputation/dashboard');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return PassengerReputationDashboard.fromJson(data);
  }

  Future<void> dismissInsight(String code) async {
    final res = await _client.post('/v1/passenger/reputation/insights/$code/dismiss');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
  }
}
