import 'api_client.dart';

class SafetyHelpTopic {
  SafetyHelpTopic({required this.code, required this.title, required this.summary});

  final String code;
  final String title;
  final String summary;

  factory SafetyHelpTopic.fromJson(Map<String, dynamic> json) {
    return SafetyHelpTopic(
      code: json['code'] as String,
      title: json['title'] as String,
      summary: json['summary'] as String? ?? '',
    );
  }
}

class TrustedContact {
  TrustedContact({
    required this.id,
    required this.name,
    required this.phoneMasked,
    this.relationshipLabel,
  });

  final String id;
  final String name;
  final String phoneMasked;
  final String? relationshipLabel;

  factory TrustedContact.fromJson(Map<String, dynamic> json) {
    return TrustedContact(
      id: json['id'] as String,
      name: json['name'] as String,
      phoneMasked: json['phoneMasked'] as String,
      relationshipLabel: json['relationshipLabel'] as String?,
    );
  }
}

class SafetyHelpDashboard {
  SafetyHelpDashboard({
    required this.helpTopics,
    required this.supportChannels,
    required this.safetyTools,
    required this.trustedContacts,
    required this.emergencyHotline,
    required this.supportPhone,
  });

  final List<SafetyHelpTopic> helpTopics;
  final List<Map<String, dynamic>> supportChannels;
  final List<Map<String, dynamic>> safetyTools;
  final List<TrustedContact> trustedContacts;
  final String emergencyHotline;
  final String supportPhone;

  factory SafetyHelpDashboard.fromJson(Map<String, dynamic> json) {
    final config = json['config'] as Map<String, dynamic>? ?? {};
    final topics = (json['helpTopics'] as List<dynamic>? ?? [])
        .map((t) => SafetyHelpTopic.fromJson(t as Map<String, dynamic>))
        .toList();
    final contacts = (json['trustedContacts'] as List<dynamic>? ?? [])
        .map((c) => TrustedContact.fromJson(c as Map<String, dynamic>))
        .toList();
    return SafetyHelpDashboard(
      helpTopics: topics,
      supportChannels: (json['supportChannels'] as List<dynamic>? ?? []).cast<Map<String, dynamic>>(),
      safetyTools: (json['safetyTools'] as List<dynamic>? ?? []).cast<Map<String, dynamic>>(),
      trustedContacts: contacts,
      emergencyHotline: config['emergencyHotline'] as String? ?? '190',
      supportPhone: config['supportPhone'] as String? ?? '',
    );
  }
}

class SafetyHelpService {
  SafetyHelpService(this._client);

  final ApiClient _client;

  Future<SafetyHelpDashboard> fetchDashboard() async {
    final res = await _client.get('/v1/passenger/safety-help/dashboard');
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return SafetyHelpDashboard.fromJson(data);
  }

  Future<void> recordInquiry({required String topicCode, String? searchQuery}) async {
    final res = await _client.post('/v1/passenger/safety-help/help/inquiries', {
      'topicCode': topicCode,
      if (searchQuery != null) 'searchQuery': searchQuery,
    });
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
  }

  Future<TrustedContact> addContact({
    required String name,
    required String phone,
    String? relationshipLabel,
  }) async {
    final res = await _client.post('/v1/passenger/safety-help/contacts', {
      'name': name,
      'phone': phone,
      if (relationshipLabel != null) 'relationshipLabel': relationshipLabel,
    });
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return TrustedContact.fromJson(data);
  }

  Future<String> shareRide({String? rideId}) async {
    final res = await _client.post('/v1/passenger/safety-help/share-ride', {
      if (rideId != null) 'rideId': rideId,
    });
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
    return data['shareUrl'] as String;
  }
}
