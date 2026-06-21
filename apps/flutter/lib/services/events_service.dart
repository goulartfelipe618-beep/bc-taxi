import '../config/api_config.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

class SurgeEvent {
  const SurgeEvent({
    required this.id,
    required this.eventName,
    required this.eventType,
    required this.intensityIndex,
    required this.startsAt,
    required this.endsAt,
  });

  final String id;
  final String eventName;
  final String eventType;
  final double intensityIndex;
  final String startsAt;
  final String endsAt;

  factory SurgeEvent.fromJson(Map<String, dynamic> json) {
    return SurgeEvent(
      id: json['id'] as String,
      eventName: json['eventName'] as String,
      eventType: json['eventType'] as String,
      intensityIndex: (json['intensityIndex'] as num).toDouble(),
      startsAt: json['startsAt'] as String,
      endsAt: json['endsAt'] as String,
    );
  }
}

class EventsService {
  static Future<List<SurgeEvent>> fetchActiveEvents({double? lat, double? lng}) async {
    final query = <String, String>{};
    if (lat != null && lng != null) {
      query['lat'] = lat.toString();
      query['lng'] = lng.toString();
    }
    final uri = Uri.parse('$apiBaseUrl/v1/events/active').replace(queryParameters: query.isEmpty ? null : query);
    final res = await http.get(uri).timeout(const Duration(seconds: 5));
    if (res.statusCode != 200) return [];
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    final list = (body['events'] as List<dynamic>).cast<Map<String, dynamic>>();
    return list.map(SurgeEvent.fromJson).toList();
  }
}
