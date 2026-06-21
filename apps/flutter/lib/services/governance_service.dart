import 'api_client.dart';

class RideGovernanceTrail {
  const RideGovernanceTrail({
    required this.rideId,
    required this.snapshots,
    required this.decisions,
  });

  final String rideId;
  final List<GovernanceSnapshot> snapshots;
  final List<GovernanceDecision> decisions;

  factory RideGovernanceTrail.fromJson(Map<String, dynamic> json) {
    return RideGovernanceTrail(
      rideId: json['rideId'] as String,
      snapshots: (json['snapshots'] as List<dynamic>)
          .map((e) => GovernanceSnapshot.fromJson(e as Map<String, dynamic>))
          .toList(),
      decisions: (json['decisions'] as List<dynamic>)
          .map((e) => GovernanceDecision.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

class GovernanceSnapshot {
  const GovernanceSnapshot({
    required this.phase,
    this.pricingRuleVersionId,
    this.matchVersionLabel,
    this.reputationVersionLabel,
    this.quotedFareCentavos,
  });

  final String phase;
  final String? pricingRuleVersionId;
  final String? matchVersionLabel;
  final String? reputationVersionLabel;
  final int? quotedFareCentavos;

  factory GovernanceSnapshot.fromJson(Map<String, dynamic> json) {
    return GovernanceSnapshot(
      phase: json['phase'] as String,
      pricingRuleVersionId: json['pricingRuleVersionId'] as String?,
      matchVersionLabel: json['matchVersionLabel'] as String?,
      reputationVersionLabel: json['reputationVersionLabel'] as String?,
      quotedFareCentavos: json['quotedFareCentavos'] as int?,
    );
  }
}

class GovernanceDecision {
  const GovernanceDecision({required this.decisionType, required this.createdAt});

  final String decisionType;
  final String createdAt;

  factory GovernanceDecision.fromJson(Map<String, dynamic> json) {
    return GovernanceDecision(
      decisionType: json['decisionType'] as String,
      createdAt: json['createdAt'] as String,
    );
  }
}

class GovernanceService {
  GovernanceService(this._client);

  final ApiClient _client;

  Future<RideGovernanceTrail> fetchRideTrail(String rideId) async {
    final res = await _client.get('/v1/rides/$rideId/governance');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return RideGovernanceTrail.fromJson(data);
  }
}
