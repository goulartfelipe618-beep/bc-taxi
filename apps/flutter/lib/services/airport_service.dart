import '../config/api_config.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

class AirportZone {
  const AirportZone({
    required this.id,
    required this.name,
    this.iataCode,
    this.pickupInstructions,
  });

  final String id;
  final String name;
  final String? iataCode;
  final String? pickupInstructions;

  factory AirportZone.fromJson(Map<String, dynamic> json) {
    return AirportZone(
      id: json['id'] as String,
      name: json['name'] as String,
      iataCode: json['iataCode'] as String?,
      pickupInstructions: json['pickupInstructions'] as String?,
    );
  }
}

class AirportContext {
  const AirportContext({
    required this.isAirportRide,
    required this.airportFeeCentavos,
    required this.airportPressure,
    this.pickupInstructions,
    this.pickupZone,
  });

  final bool isAirportRide;
  final int airportFeeCentavos;
  final double airportPressure;
  final String? pickupInstructions;
  final AirportZone? pickupZone;

  factory AirportContext.fromJson(Map<String, dynamic> json) {
    return AirportContext(
      isAirportRide: json['isAirportRide'] as bool? ?? false,
      airportFeeCentavos: (json['airportFeeCentavos'] as num?)?.toInt() ?? 0,
      airportPressure: (json['airportPressure'] as num?)?.toDouble() ?? 0,
      pickupInstructions: json['pickupInstructions'] as String?,
      pickupZone: json['pickupZone'] != null
          ? AirportZone.fromJson(json['pickupZone'] as Map<String, dynamic>)
          : null,
    );
  }
}

class AirportService {
  static Future<AirportZone?> detectAt(double lat, double lng) async {
    final uri = Uri.parse('$apiBaseUrl/v1/airports/detect').replace(
      queryParameters: {'lat': lat.toString(), 'lng': lng.toString()},
    );
    final res = await http.get(uri).timeout(const Duration(seconds: 5));
    if (res.statusCode != 200) return null;
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    if (body['inAirportZone'] != true) return null;
    return AirportZone.fromJson(body['zone'] as Map<String, dynamic>);
  }

  static Future<AirportContext?> fetchContext({
    double? fromLat,
    double? fromLng,
    double? toLat,
    double? toLng,
    String? categoryCode,
  }) async {
    final uri = Uri.parse('$apiBaseUrl/v1/airports/context');
    final res = await http
        .post(
          uri,
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            if (fromLat != null) 'fromLat': fromLat,
            if (fromLng != null) 'fromLng': fromLng,
            if (toLat != null) 'toLat': toLat,
            if (toLng != null) 'toLng': toLng,
            if (categoryCode != null) 'categoryCode': categoryCode,
          }),
        )
        .timeout(const Duration(seconds: 5));
    if (res.statusCode != 200) return null;
    return AirportContext.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }
}
