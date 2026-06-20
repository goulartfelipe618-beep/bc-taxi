import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../models/trip_draft.dart';
import '../../theme/passenger_theme.dart';

class TripRouteMap extends StatelessWidget {
  const TripRouteMap({
    super.key,
    required this.pickupLat,
    required this.pickupLng,
    required this.dropoffLat,
    required this.dropoffLng,
    this.stops = const [],
    this.routePoints = const [],
    this.pickupLabel,
    this.interactive = false,
  });

  final double pickupLat;
  final double pickupLng;
  final double dropoffLat;
  final double dropoffLng;
  final List<TripStop> stops;
  final List<RoutePoint> routePoints;
  final String? pickupLabel;
  final bool interactive;

  List<LatLng> get _polyline {
    if (routePoints.isNotEmpty) {
      return routePoints.map((p) => LatLng(p.lat, p.lng)).toList();
    }
    return [
      LatLng(pickupLat, pickupLng),
      ...stops.map((s) => LatLng(s.lat, s.lng)),
      LatLng(dropoffLat, dropoffLng),
    ];
  }

  List<LatLng> get _allPoints {
    return [
      LatLng(pickupLat, pickupLng),
      ...stops.map((s) => LatLng(s.lat, s.lng)),
      LatLng(dropoffLat, dropoffLng),
    ];
  }

  LatLngBounds _bounds() {
    final points = [..._allPoints, ..._polyline];
    var minLat = points.first.latitude;
    var maxLat = points.first.latitude;
    var minLng = points.first.longitude;
    var maxLng = points.first.longitude;
    for (final p in points) {
      if (p.latitude < minLat) minLat = p.latitude;
      if (p.latitude > maxLat) maxLat = p.latitude;
      if (p.longitude < minLng) minLng = p.longitude;
      if (p.longitude > maxLng) maxLng = p.longitude;
    }
    const pad = 0.012;
    return LatLngBounds(
      LatLng(minLat - pad, minLng - pad),
      LatLng(maxLat + pad, maxLng + pad),
    );
  }

  @override
  Widget build(BuildContext context) {
    return FlutterMap(
      options: MapOptions(
        initialCameraFit: CameraFit.bounds(bounds: _bounds(), padding: const EdgeInsets.all(48)),
        interactionOptions: InteractionOptions(
          flags: interactive ? InteractiveFlag.all : InteractiveFlag.none,
        ),
      ),
      children: [
        TileLayer(
          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          userAgentPackageName: 'com.bctaxi.app',
        ),
        if (_polyline.length >= 2)
          PolylineLayer(
            polylines: [
              Polyline(
                points: _polyline,
                strokeWidth: 5,
                color: const Color(0xFF276EF1),
              ),
            ],
          ),
        MarkerLayer(
          markers: [
            Marker(
              point: LatLng(pickupLat, pickupLng),
              width: pickupLabel != null ? 220 : 28,
              height: pickupLabel != null ? 56 : 28,
              alignment: Alignment.topCenter,
              child: pickupLabel != null ? _CalloutPin(label: pickupLabel!) : const _PickupPin(),
            ),
            ...stops.asMap().entries.map(
              (e) => Marker(
                point: LatLng(e.value.lat, e.value.lng),
                width: 28,
                height: 28,
                child: _StopPin(index: e.key + 1),
              ),
            ),
            Marker(
              point: LatLng(dropoffLat, dropoffLng),
              width: 28,
              height: 28,
              child: const _DropoffPin(),
            ),
          ],
        ),
      ],
    );
  }
}

class _PickupPin extends StatelessWidget {
  const _PickupPin();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 18,
      height: 18,
      decoration: BoxDecoration(
        color: BcColors.black,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 3),
        boxShadow: const [BoxShadow(color: Color(0x44000000), blurRadius: 4, offset: Offset(0, 2))],
      ),
    );
  }
}

class _DropoffPin extends StatelessWidget {
  const _DropoffPin();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 16,
      height: 16,
      decoration: BoxDecoration(
        color: BcColors.black,
        border: Border.all(color: Colors.white, width: 2),
        boxShadow: const [BoxShadow(color: Color(0x44000000), blurRadius: 4, offset: Offset(0, 2))],
      ),
    );
  }
}

class _StopPin extends StatelessWidget {
  const _StopPin({required this.index});

  final int index;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 22,
      height: 22,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: BcColors.black, width: 2),
        boxShadow: const [BoxShadow(color: Color(0x44000000), blurRadius: 4, offset: Offset(0, 2))],
      ),
      child: Text('$index', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
    );
  }
}

class _CalloutPin extends StatelessWidget {
  const _CalloutPin({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(10),
            boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 8, offset: Offset(0, 2))],
          ),
          child: Text(
            label,
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
          ),
        ),
        const SizedBox(height: 4),
        Container(
          width: 14,
          height: 14,
          decoration: BoxDecoration(
            color: BcColors.black,
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 2),
          ),
        ),
      ],
    );
  }
}
