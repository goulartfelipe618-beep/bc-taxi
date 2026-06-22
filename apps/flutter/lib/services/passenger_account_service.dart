import 'dart:convert';

import 'api_client.dart';
import 'payment_service.dart';

class PassengerAccountProfile {
  PassengerAccountProfile({
    required this.fullName,
    required this.email,
    this.phone,
    this.gender,
    this.rating,
    this.tier,
    this.passwordChangedLabel,
    this.emailVerified = false,
    this.phoneVerified = false,
    this.identityStatus = 'pending',
  });

  final String fullName;
  final String email;
  final String? phone;
  final String? gender;
  final double? rating;
  final String? tier;
  final String? passwordChangedLabel;
  final bool emailVerified;
  final bool phoneVerified;
  final String identityStatus;

  factory PassengerAccountProfile.fromJson(Map<String, dynamic> json) {
    return PassengerAccountProfile(
      fullName: json['fullName'] as String? ?? '',
      email: json['email'] as String? ?? '',
      phone: json['phone'] as String?,
      gender: json['gender'] as String?,
      rating: (json['rating'] as num?)?.toDouble(),
      tier: json['tier'] as String?,
      passwordChangedLabel: json['passwordChangedLabel'] as String?,
      emailVerified: json['emailVerified'] as bool? ?? false,
      phoneVerified: json['phoneVerified'] as bool? ?? false,
      identityStatus: json['identityStatus'] as String? ?? 'pending',
    );
  }
}

class PassengerWalletTransaction {
  PassengerWalletTransaction({
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

  factory PassengerWalletTransaction.fromJson(Map<String, dynamic> json) {
    return PassengerWalletTransaction(
      id: json['id'] as String,
      title: json['title'] as String,
      amountCentavos: json['amountCentavos'] as int,
      createdAt: json['createdAt'] as String,
    );
  }
}

class PassengerWallet {
  PassengerWallet({
    required this.balanceCentavos,
    required this.balanceLabel,
    required this.transactions,
  });

  final int balanceCentavos;
  final String balanceLabel;
  final List<PassengerWalletTransaction> transactions;

  factory PassengerWallet.fromJson(Map<String, dynamic> json) {
    final txs = (json['transactions'] as List<dynamic>? ?? [])
        .map((t) => PassengerWalletTransaction.fromJson(t as Map<String, dynamic>))
        .toList();
    return PassengerWallet(
      balanceCentavos: json['balanceCentavos'] as int? ?? 0,
      balanceLabel: json['balanceLabel'] as String? ?? 'R\$ 0,00',
      transactions: txs,
    );
  }
}

class PassengerInboxMessage {
  PassengerInboxMessage({
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

  factory PassengerInboxMessage.fromJson(Map<String, dynamic> json) {
    return PassengerInboxMessage(
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

class PassengerSecuritySummary {
  PassengerSecuritySummary({
    required this.passwordChangedLabel,
    required this.twoFactorEnabled,
    this.recoveryPhone,
  });

  final String passwordChangedLabel;
  final bool twoFactorEnabled;
  final String? recoveryPhone;

  factory PassengerSecuritySummary.fromJson(Map<String, dynamic> json) {
    return PassengerSecuritySummary(
      passwordChangedLabel: json['passwordChangedLabel'] as String? ?? '',
      twoFactorEnabled: json['twoFactorEnabled'] as bool? ?? false,
      recoveryPhone: json['recoveryPhone'] as String?,
    );
  }
}

class PassengerAccountDashboard {
  PassengerAccountDashboard({
    required this.profile,
    this.wallet,
    required this.paymentMethods,
    required this.recentMessages,
    required this.unreadMessageCount,
  });

  final PassengerAccountProfile profile;
  final PassengerWallet? wallet;
  final List<PaymentMethod> paymentMethods;
  final List<PassengerInboxMessage> recentMessages;
  final int unreadMessageCount;

  factory PassengerAccountDashboard.fromJson(Map<String, dynamic> json) {
    final methods = (json['paymentMethods'] as List<dynamic>? ?? [])
        .map((m) => PaymentMethod.fromJson({
              'id': m['id'],
              'type': m['methodType'],
              'label': m['label'],
              'isDefault': m['isDefault'],
              'lastFour': m['lastFour'],
              'brand': m['brand'],
            }))
        .toList();
    final messages = (json['recentMessages'] as List<dynamic>? ?? [])
        .map((m) => PassengerInboxMessage.fromJson(m as Map<String, dynamic>))
        .toList();
    return PassengerAccountDashboard(
      profile: PassengerAccountProfile.fromJson(json['profile'] as Map<String, dynamic>),
      wallet: json['wallet'] != null ? PassengerWallet.fromJson(json['wallet'] as Map<String, dynamic>) : null,
      paymentMethods: methods,
      recentMessages: messages,
      unreadMessageCount: json['unreadMessageCount'] as int? ?? 0,
    );
  }
}

class PassengerAccountService {
  PassengerAccountService(this._client);

  final ApiClient _client;

  Future<PassengerAccountDashboard> fetchDashboard() async {
    final res = await _client.get('/v1/passenger/account/dashboard');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return PassengerAccountDashboard.fromJson(data);
  }

  Future<PassengerWallet> fetchWallet() async {
    final res = await _client.get('/v1/passenger/account/wallet');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return PassengerWallet.fromJson(data['wallet'] as Map<String, dynamic>);
  }

  Future<List<PassengerInboxMessage>> fetchMessages() async {
    final res = await _client.get('/v1/passenger/account/messages');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return (data['messages'] as List<dynamic>)
        .map((m) => PassengerInboxMessage.fromJson(m as Map<String, dynamic>))
        .toList();
  }

  Future<PassengerSecuritySummary> fetchSecurity() async {
    final res = await _client.get('/v1/passenger/account/security');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return PassengerSecuritySummary.fromJson(data['security'] as Map<String, dynamic>);
  }

  Future<PassengerAccountDashboard> updateProfile(Map<String, dynamic> body) async {
    final res = await _client.patch('/v1/passenger/account/profile', body: body);
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return PassengerAccountDashboard.fromJson(data);
  }

  Future<void> changePassword(String currentPassword, String newPassword) async {
    final res = await _client.post('/v1/passenger/account/security/password', body: {
      'currentPassword': currentPassword,
      'newPassword': newPassword,
    });
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
  }

  Future<void> setTwoFactor(bool enabled) async {
    final res = await _client.post('/v1/passenger/account/security/two-factor', body: {'enabled': enabled});
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
  }

  Future<void> markMessageRead(String messageId) async {
    final res = await _client.post('/v1/passenger/account/messages/$messageId/read');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
  }
}
