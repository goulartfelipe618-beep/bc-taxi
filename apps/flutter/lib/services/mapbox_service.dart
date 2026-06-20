import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/api_config.dart';

class MapPlace {
  const MapPlace({
    required this.id,
    required this.label,
    required this.address,
    required this.lat,
    required this.lng,
    this.featureId,
    this.source = 'mapbox',
  });

  final String id;
  final String label;
  final String address;
  final double lat;
  final double lng;
  final String? featureId;
  final String source;

  factory MapPlace.fromJson(Map<String, dynamic> json) {
    return MapPlace(
      id: json['id'] as String,
      label: json['label'] as String,
      address: json['address'] as String,
      lat: (json['lat'] as num).toDouble(),
      lng: (json['lng'] as num).toDouble(),
      featureId: json['featureId'] as String?,
      source: json['source'] as String? ?? 'mapbox',
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'label': label,
        'address': address,
        'lat': lat,
        'lng': lng,
        if (featureId != null) 'featureId': featureId,
        'source': source,
      };
}

class RouteSummary {
  const RouteSummary({
    required this.distanceKm,
    required this.durationMin,
  });

  final double distanceKm;
  final double durationMin;

  factory RouteSummary.fromJson(Map<String, dynamic> json) {
    return RouteSummary(
      distanceKm: (json['distanceKm'] as num).toDouble(),
      durationMin: (json['durationMin'] as num).toDouble(),
    );
  }
}

class MapboxService {
  static Future<List<MapPlace>> autocomplete(String query, {int limit = 8}) async {
    try {
      final uri = Uri.parse('$apiBaseUrl/v1/places/autocomplete').replace(
        queryParameters: {'q': query, 'limit': '$limit'},
      );
      final res = await http.get(uri).timeout(const Duration(seconds: 6));
      if (res.statusCode != 200) return [];
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      final list = (body['places'] as List<dynamic>).cast<Map<String, dynamic>>();
      return list.map(MapPlace.fromJson).toList();
    } catch (_) {
      return [];
    }
  }

  static Future<MapPlace?> resolvePlace(String query) async {
    final places = await autocomplete(query, limit: 1);
    return places.isEmpty ? null : places.first;
  }

  static Future<RouteSummary?> getDirections({
    required double fromLat,
    required double fromLng,
    required double toLat,
    required double toLng,
  }) async {
    try {
      final uri = Uri.parse('$apiBaseUrl/v1/routes/directions').replace(
        queryParameters: {
          'fromLat': '$fromLat',
          'fromLng': '$fromLng',
          'toLat': '$toLat',
          'toLng': '$toLng',
        },
      );
      final res = await http.get(uri).timeout(const Duration(seconds: 8));
      if (res.statusCode != 200) return null;
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      return RouteSummary.fromJson(body['route'] as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  static Future<void> confirmPlace(MapPlace place, {String? token}) async {
    if (token == null) return;
    try {
      await http
          .post(
            Uri.parse('$apiBaseUrl/v1/places/confirm'),
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer $token',
            },
            body: jsonEncode(place.toJson()),
          )
          .timeout(const Duration(seconds: 5));
    } catch (_) {
      /* best effort */
    }
  }

  static Future<List<MapPlace>> recentPlaces({String? token, int limit = 10}) async {
    if (token == null) return [];
    try {
      final uri = Uri.parse('$apiBaseUrl/v1/places/recent').replace(
        queryParameters: {'limit': '$limit'},
      );
      final res = await http.get(
        uri,
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 5));
      if (res.statusCode != 200) return [];
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      final list = (body['places'] as List<dynamic>).cast<Map<String, dynamic>>();
      return list
          .map(
            (p) => MapPlace(
              id: p['featureId'] as String? ?? p['id'] as String,
              label: p['label'] as String,
              address: p['address'] as String,
              lat: (p['lat'] as num).toDouble(),
              lng: (p['lng'] as num).toDouble(),
              featureId: p['featureId'] as String?,
              source: p['source'] as String? ?? 'mapbox',
            ),
          )
          .toList();
    } catch (_) {
      return [];
    }
  }
}
