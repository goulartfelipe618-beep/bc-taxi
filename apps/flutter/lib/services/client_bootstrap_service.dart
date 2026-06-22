import 'dart:convert';

import '../config/api_config.dart';
import 'api_client.dart';

class ClientBootstrap {
  ClientBootstrap({
    required this.configVersion,
    required this.inCoverage,
    this.serviceRegionId,
    this.pricingRegionId,
    required this.categories,
    required this.paymentMethods,
    this.profile,
    this.reputationScore,
    this.reputationTier,
  });

  final String configVersion;
  final bool inCoverage;
  final String? serviceRegionId;
  final String? pricingRegionId;
  final List<Map<String, dynamic>> categories;
  final List<ClientPaymentMethod> paymentMethods;
  final Map<String, dynamic>? profile;
  final double? reputationScore;
  final String? reputationTier;

  factory ClientBootstrap.fromJson(Map<String, dynamic> json) {
    final payment = json['payment'] as Map<String, dynamic>? ?? {};
    final methods = (payment['methods'] as List<dynamic>? ?? [])
        .map((m) => ClientPaymentMethod.fromJson(m as Map<String, dynamic>))
        .toList();
    final reputation = json['reputation'] as Map<String, dynamic>?;
    return ClientBootstrap(
      configVersion: json['configVersion'] as String? ?? 'unknown',
      inCoverage: json['inCoverage'] as bool? ?? true,
      serviceRegionId: json['serviceRegionId'] as String?,
      pricingRegionId: json['pricingRegionId'] as String?,
      categories: (json['categories'] as List<dynamic>? ?? []).cast<Map<String, dynamic>>(),
      paymentMethods: methods,
      profile: json['profile'] as Map<String, dynamic>?,
      reputationScore: reputation != null ? (reputation['score'] as num?)?.toDouble() : null,
      reputationTier: reputation?['tier'] as String?,
    );
  }
}

class ClientPaymentMethod {
  ClientPaymentMethod({
    required this.id,
    required this.methodType,
    required this.label,
    this.isDefault = false,
  });

  final String id;
  final String methodType;
  final String label;
  final bool isDefault;

  factory ClientPaymentMethod.fromJson(Map<String, dynamic> json) {
    return ClientPaymentMethod(
      id: json['id'] as String,
      methodType: json['methodType'] as String? ?? 'pix',
      label: json['label'] as String? ?? 'Pagamento',
      isDefault: json['isDefault'] as bool? ?? false,
    );
  }
}

class ClientBootstrapService {
  static Future<ClientBootstrap> fetch({
    String? token,
    double? lat,
    double? lng,
  }) async {
    final query = <String, String>{};
    if (lat != null) query['lat'] = lat.toString();
    if (lng != null) query['lng'] = lng.toString();
    final uri = Uri.parse('$apiBaseUrl/v1/client/bootstrap').replace(queryParameters: query.isEmpty ? null : query);

    final res = token != null
        ? await ApiClient(token).get('/v1/client/bootstrap${query.isEmpty ? '' : '?${uri.query}'}')
        : await ApiClient.getPublic('/v1/client/bootstrap${query.isEmpty ? '' : '?${uri.query}'}');

    final data = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode >= 400) {
      throw Exception(data['error']?.toString() ?? 'Erro ao carregar bootstrap');
    }
    return ClientBootstrap.fromJson(data);
  }
}
