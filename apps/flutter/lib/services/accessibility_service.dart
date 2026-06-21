import '../config/api_config.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

class AccessibilityNeed {
  const AccessibilityNeed({
    required this.code,
    required this.label,
    required this.description,
    required this.requiresWheelchairVehicle,
  });

  final String code;
  final String label;
  final String description;
  final bool requiresWheelchairVehicle;

  factory AccessibilityNeed.fromJson(Map<String, dynamic> json) {
    return AccessibilityNeed(
      code: json['code'] as String,
      label: json['label'] as String,
      description: json['description'] as String,
      requiresWheelchairVehicle: json['requiresWheelchairVehicle'] as bool? ?? false,
    );
  }
}

class AccessibilityService {
  static Future<List<AccessibilityNeed>> fetchNeeds() async {
    final res = await http.get(Uri.parse('$apiBaseUrl/v1/accessibility/needs')).timeout(const Duration(seconds: 5));
    if (res.statusCode != 200) return [];
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return (body['needs'] as List<dynamic>)
        .cast<Map<String, dynamic>>()
        .map(AccessibilityNeed.fromJson)
        .toList();
  }

  static Future<bool> validateBooking({
    required String token,
    required String categoryCode,
    required String accessibilityNeedCode,
    int assistiveDeviceCount = 0,
  }) async {
    final res = await http
        .post(
          Uri.parse('$apiBaseUrl/v1/accessibility/validate'),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer $token',
          },
          body: jsonEncode({
            'categoryCode': categoryCode,
            'accessibilityNeedCode': accessibilityNeedCode,
            'assistiveDeviceCount': assistiveDeviceCount,
          }),
        )
        .timeout(const Duration(seconds: 8));
    return res.statusCode == 200;
  }

  static Future<bool> updateDriverProfile({
    required String token,
    required bool pcdOptIn,
    List<String> capabilities = const [],
  }) async {
    final res = await http
        .put(
          Uri.parse('$apiBaseUrl/v1/accessibility/driver/profile'),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer $token',
          },
          body: jsonEncode({'pcdOptIn': pcdOptIn, 'capabilities': capabilities}),
        )
        .timeout(const Duration(seconds: 8));
    return res.statusCode == 200;
  }
}
