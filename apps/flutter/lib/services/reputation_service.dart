import 'api_client.dart';

class ReputationBadge {
  const ReputationBadge({
    required this.code,
    required this.label,
    required this.description,
    this.icon,
    required this.awardedAt,
  });

  final String code;
  final String label;
  final String description;
  final String? icon;
  final String awardedAt;

  factory ReputationBadge.fromJson(Map<String, dynamic> json) {
    return ReputationBadge(
      code: json['code'] as String,
      label: json['label'] as String,
      description: json['description'] as String? ?? '',
      icon: json['icon'] as String?,
      awardedAt: json['awardedAt'] as String,
    );
  }
}

class PendingReview {
  const PendingReview({
    required this.id,
    required this.rideId,
    required this.reviewedUserId,
    required this.reviewerRole,
    required this.expiresAt,
    required this.daysRemaining,
  });

  final String id;
  final String rideId;
  final String reviewedUserId;
  final String reviewerRole;
  final String expiresAt;
  final int daysRemaining;

  factory PendingReview.fromJson(Map<String, dynamic> json) {
    return PendingReview(
      id: json['id'] as String,
      rideId: json['rideId'] as String,
      reviewedUserId: json['reviewedUserId'] as String,
      reviewerRole: json['reviewerRole'] as String,
      expiresAt: json['expiresAt'] as String,
      daysRemaining: json['daysRemaining'] as int? ?? 0,
    );
  }
}

class ReputationProfile {
  const ReputationProfile({
    required this.score,
    required this.displayScore,
    required this.tier,
    required this.monitoring,
    this.benefitsRevoked = false,
  });

  final double score;
  final double displayScore;
  final String tier;
  final bool monitoring;
  final bool benefitsRevoked;

  factory ReputationProfile.fromJson(Map<String, dynamic> json) {
    return ReputationProfile(
      score: (json['score'] as num).toDouble(),
      displayScore: (json['displayScore'] as num).toDouble(),
      tier: json['tier'] as String,
      monitoring: json['monitoring'] as bool? ?? false,
      benefitsRevoked: json['benefitsRevoked'] as bool? ?? false,
    );
  }
}

class ReputationDashboard {
  const ReputationDashboard({
    required this.profile,
    required this.badges,
    required this.pendingReviews,
  });

  final ReputationProfile profile;
  final List<ReputationBadge> badges;
  final List<PendingReview> pendingReviews;

  factory ReputationDashboard.fromJson(Map<String, dynamic> json) {
    final profileJson = json['profile'] as Map<String, dynamic>;
    final badges = (json['badges'] as List<dynamic>? ?? [])
        .cast<Map<String, dynamic>>()
        .map(ReputationBadge.fromJson)
        .toList();
    final pending = (json['pendingReviews'] as List<dynamic>? ?? [])
        .cast<Map<String, dynamic>>()
        .map(PendingReview.fromJson)
        .toList();
    return ReputationDashboard(
      profile: ReputationProfile.fromJson(profileJson),
      badges: badges,
      pendingReviews: pending,
    );
  }
}

class ReputationService {
  ReputationService(this._client);

  final ApiClient _client;

  Future<ReputationDashboard> fetchDashboard() async {
    final res = await _client.get('/v1/reputation/me');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return ReputationDashboard.fromJson(data);
  }

  Future<List<PendingReview>> fetchPendingReviews() async {
    final res = await _client.get('/v1/reputation/me/pending-reviews');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return (data['pending'] as List<dynamic>)
        .cast<Map<String, dynamic>>()
        .map(PendingReview.fromJson)
        .toList();
  }

  Future<List<ReputationBadge>> fetchBadges() async {
    final res = await _client.get('/v1/reputation/me/badges');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return (data['badges'] as List<dynamic>)
        .cast<Map<String, dynamic>>()
        .map(ReputationBadge.fromJson)
        .toList();
  }
}
