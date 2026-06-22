import 'api_client.dart';

class DriverAccountProfile {
  DriverAccountProfile({
    required this.fullName,
    required this.email,
    this.phone,
    this.rating,
    this.tier,
    this.passwordChangedLabel,
    this.emergencyContact,
    this.emailVerified = false,
    this.phoneVerified = false,
    this.identityStatus = 'pending',
    this.preferredPayoutMethod = 'pix',
  });

  final String fullName;
  final String email;
  final String? phone;
  final double? rating;
  final String? tier;
  final String? passwordChangedLabel;
  final String? emergencyContact;
  final bool emailVerified;
  final bool phoneVerified;
  final String identityStatus;
  final String preferredPayoutMethod;

  factory DriverAccountProfile.fromJson(Map<String, dynamic> json) {
    return DriverAccountProfile(
      fullName: json['fullName'] as String? ?? '',
      email: json['email'] as String? ?? '',
      phone: json['phone'] as String?,
      rating: (json['rating'] as num?)?.toDouble(),
      tier: json['tier'] as String?,
      passwordChangedLabel: json['passwordChangedLabel'] as String?,
      emergencyContact: json['emergencyContact'] as String?,
      emailVerified: json['emailVerified'] as bool? ?? false,
      phoneVerified: json['phoneVerified'] as bool? ?? false,
      identityStatus: json['identityStatus'] as String? ?? 'pending',
      preferredPayoutMethod: json['preferredPayoutMethod'] as String? ?? 'pix',
    );
  }
}

class DriverEarningsTransaction {
  DriverEarningsTransaction({
    required this.id,
    required this.title,
    required this.amountCentavos,
    required this.createdAt,
  });

  final String id;
  final String title;
  final int amountCentavos;
  final String createdAt;

  String get amountLabel {
    final value = amountCentavos / 100;
    final prefix = value >= 0 ? '+R\$ ' : '-R\$ ';
    return '$prefix${value.abs().toStringAsFixed(2)}';
  }

  factory DriverEarningsTransaction.fromJson(Map<String, dynamic> json) {
    return DriverEarningsTransaction(
      id: json['id'] as String,
      title: json['title'] as String,
      amountCentavos: json['amountCentavos'] as int,
      createdAt: json['createdAt'] as String,
    );
  }
}

class DriverEarnings {
  DriverEarnings({
    required this.availableCentavos,
    required this.availableLabel,
    required this.pendingCentavos,
    required this.pendingLabel,
    required this.totalGrossCentavos,
    required this.transactions,
  });

  final int availableCentavos;
  final String availableLabel;
  final int pendingCentavos;
  final String pendingLabel;
  final int totalGrossCentavos;
  final List<DriverEarningsTransaction> transactions;

  factory DriverEarnings.fromJson(Map<String, dynamic> json) {
    final txs = (json['transactions'] as List<dynamic>? ?? [])
        .map((t) => DriverEarningsTransaction.fromJson(t as Map<String, dynamic>))
        .toList();
    return DriverEarnings(
      availableCentavos: json['availableCentavos'] as int? ?? 0,
      availableLabel: json['availableLabel'] as String? ?? 'R\$ 0,00',
      pendingCentavos: json['pendingCentavos'] as int? ?? 0,
      pendingLabel: json['pendingLabel'] as String? ?? 'R\$ 0,00',
      totalGrossCentavos: json['totalGrossCentavos'] as int? ?? 0,
      transactions: txs,
    );
  }
}

class DriverInboxMessage {
  DriverInboxMessage({
    required this.id,
    required this.title,
    required this.preview,
    required this.body,
    required this.iconType,
    required this.isRead,
    required this.createdAt,
  });

  final String id;
  final String title;
  final String preview;
  final String body;
  final String iconType;
  final bool isRead;
  final String createdAt;

  factory DriverInboxMessage.fromJson(Map<String, dynamic> json) {
    return DriverInboxMessage(
      id: json['id'] as String,
      title: json['title'] as String,
      preview: json['preview'] as String,
      body: json['body'] as String,
      iconType: json['iconType'] as String? ?? 'info',
      isRead: json['isRead'] as bool? ?? false,
      createdAt: json['createdAt'] as String,
    );
  }
}

class DriverSecuritySummary {
  DriverSecuritySummary({
    required this.passwordChangedLabel,
    required this.twoFactorEnabled,
    this.emergencyContact,
    this.pixKeyMasked,
    this.preferredPayoutMethod = 'pix',
  });

  final String passwordChangedLabel;
  final bool twoFactorEnabled;
  final String? emergencyContact;
  final String? pixKeyMasked;
  final String preferredPayoutMethod;

  factory DriverSecuritySummary.fromJson(Map<String, dynamic> json) {
    return DriverSecuritySummary(
      passwordChangedLabel: json['passwordChangedLabel'] as String? ?? '',
      twoFactorEnabled: json['twoFactorEnabled'] as bool? ?? false,
      emergencyContact: json['emergencyContact'] as String?,
      pixKeyMasked: json['pixKeyMasked'] as String?,
      preferredPayoutMethod: json['preferredPayoutMethod'] as String? ?? 'pix',
    );
  }
}

class DriverAccountDashboard {
  DriverAccountDashboard({
    required this.profile,
    this.earnings,
    required this.recentMessages,
    required this.unreadMessageCount,
    this.payoutSummaryRideCount = 0,
    this.payoutSummaryGrossLabel,
  });

  final DriverAccountProfile profile;
  final DriverEarnings? earnings;
  final List<DriverInboxMessage> recentMessages;
  final int unreadMessageCount;
  final int payoutSummaryRideCount;
  final String? payoutSummaryGrossLabel;

  factory DriverAccountDashboard.fromJson(Map<String, dynamic> json) {
    final messages = (json['recentMessages'] as List<dynamic>? ?? [])
        .map((m) => DriverInboxMessage.fromJson(m as Map<String, dynamic>))
        .toList();
    final payout = json['payoutSummary'] as Map<String, dynamic>?;
    return DriverAccountDashboard(
      profile: DriverAccountProfile.fromJson(json['profile'] as Map<String, dynamic>),
      earnings: json['earnings'] != null
          ? DriverEarnings.fromJson(json['earnings'] as Map<String, dynamic>)
          : null,
      recentMessages: messages,
      unreadMessageCount: json['unreadMessageCount'] as int? ?? 0,
      payoutSummaryRideCount: payout?['rideCount'] as int? ?? 0,
      payoutSummaryGrossLabel: payout?['totalGrossLabel'] as String?,
    );
  }
}

class DriverAccountService {
  DriverAccountService(this._client);

  final ApiClient _client;

  Future<DriverAccountDashboard> fetchDashboard() async {
    final res = await _client.get('/v1/driver/account/dashboard');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return DriverAccountDashboard.fromJson(data);
  }

  Future<DriverEarnings> fetchEarnings() async {
    final res = await _client.get('/v1/driver/account/earnings');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return DriverEarnings.fromJson(data['earnings'] as Map<String, dynamic>);
  }

  Future<List<DriverInboxMessage>> fetchMessages() async {
    final res = await _client.get('/v1/driver/account/messages');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return (data['messages'] as List<dynamic>)
        .map((m) => DriverInboxMessage.fromJson(m as Map<String, dynamic>))
        .toList();
  }

  Future<DriverSecuritySummary> fetchSecurity() async {
    final res = await _client.get('/v1/driver/account/security');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return DriverSecuritySummary.fromJson(data['security'] as Map<String, dynamic>);
  }

  Future<DriverAccountDashboard> updateProfile(Map<String, dynamic> body) async {
    final res = await _client.patch('/v1/driver/account/profile', body: body);
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return DriverAccountDashboard.fromJson(data);
  }

  Future<void> changePassword(String currentPassword, String newPassword) async {
    final res = await _client.post('/v1/driver/account/security/password', body: {
      'currentPassword': currentPassword,
      'newPassword': newPassword,
    });
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
  }

  Future<void> setTwoFactor(bool enabled) async {
    final res = await _client.post('/v1/driver/account/security/two-factor', body: {'enabled': enabled});
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
  }

  Future<void> markMessageRead(String messageId) async {
    final res = await _client.post('/v1/driver/account/messages/$messageId/read');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
  }
}
