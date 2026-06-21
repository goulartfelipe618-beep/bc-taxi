import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/api_config.dart';

class AiInsightJob {
  const AiInsightJob({
    required this.id,
    required this.useCase,
    required this.status,
    this.summary,
    this.confidence,
    this.modelVersion,
  });

  final String id;
  final String useCase;
  final String status;
  final String? summary;
  final double? confidence;
  final String? modelVersion;

  factory AiInsightJob.fromJson(Map<String, dynamic> json) {
    final job = json['job'] as Map<String, dynamic>? ?? json;
    final output = job['output'] as Map<String, dynamic>?;
    return AiInsightJob(
      id: job['id'] as String? ?? '',
      useCase: job['useCase'] as String? ?? '',
      status: job['status'] as String? ?? '',
      summary: output?['summary'] as String?,
      confidence: (job['confidence'] as num?)?.toDouble(),
      modelVersion: job['modelVersion'] as String?,
    );
  }
}

class AiInsightsService {
  static Map<String, String> _adminHeaders(String adminKey) => {
        'Content-Type': 'application/json',
        'X-Admin-Key': adminKey,
      };

  static Future<AiInsightJob?> enqueueJob({
    required String adminKey,
    required String useCase,
    required Map<String, dynamic> features,
    bool processImmediately = true,
  }) async {
    final uri = Uri.parse('$apiBaseUrl/v1/ai/jobs');
    final res = await http
        .post(
          uri,
          headers: _adminHeaders(adminKey),
          body: jsonEncode({
            'useCase': useCase,
            'features': features,
            'processImmediately': processImmediately,
          }),
        )
        .timeout(const Duration(seconds: 15));
    if (res.statusCode != 201 && res.statusCode != 202) return null;
    return AiInsightJob.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  static Future<Map<String, dynamic>?> fetchRecommendation({
    required String adminKey,
    required String useCase,
  }) async {
    final uri = Uri.parse('$apiBaseUrl/v1/ai/recommendations/$useCase');
    final res = await http
        .get(uri, headers: _adminHeaders(adminKey))
        .timeout(const Duration(seconds: 10));
    if (res.statusCode != 200) return null;
    return jsonDecode(res.body) as Map<String, dynamic>;
  }
}
