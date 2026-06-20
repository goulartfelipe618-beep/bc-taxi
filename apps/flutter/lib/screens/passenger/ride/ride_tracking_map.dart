import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../models/ride.dart';

class RideTrackingMap extends StatelessWidget {
  const RideTrackingMap({
    super.key,
    required this.ride,
    this.driverLocation,
  });

  final RideRecord ride;
  final DriverLocation? driverLocation;

  LatLng get _pickup => LatLng(ride.pickupLat, ride.pickupLng);
  LatLng get _dropoff => LatLng(ride.dropoffLat, ride.dropoffLng);

  List<LatLng> get _points {
    final list = [_pickup, _dropoff];
    if (driverLocation != null) {
      list.add(LatLng(driverLocation!.lat, driverLocation!.lng));
    }
    return list;
  }

  LatLngBounds _bounds() {
    var minLat = _points.first.latitude;
    var maxLat = _points.first.latitude;
    var minLng = _points.first.longitude;
    var maxLng = _points.first.longitude;
    for (final p in _points) {
      minLat = minLat < p.latitude ? minLat : p.latitude;
      maxLat = maxLat > p.latitude ? maxLat : p.latitude;
      minLng = minLng < p.longitude ? minLng : p.longitude;
      maxLng = maxLng > p.longitude ? maxLng : p.longitude;
    }
    return LatLngBounds(LatLng(minLat, minLng), LatLng(maxLat, maxLng));
  }

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: FlutterMap(
        options: MapOptions(
          initialCameraFit: CameraFit.bounds(bounds: _bounds(), padding: const EdgeInsets.all(48)),
          interactionOptions: const InteractionOptions(flags: InteractiveFlag.all),
        ),
        children: [
          TileLayer(
            urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            userAgentPackageName: 'com.bctaxi.app',
          ),
          if (driverLocation != null)
            PolylineLayer(
              polylines: [
                Polyline(
                  points: [
                    LatLng(driverLocation!.lat, driverLocation!.lng),
                    ride.status == 'IN_PROGRESS' ? _dropoff : _pickup,
                  ],
                  color: Colors.blue.shade700,
                  strokeWidth: 4,
                ),
              ],
            ),
          MarkerLayer(
            markers: [
              Marker(
                point: _pickup,
                width: 36,
                height: 36,
                child: const Icon(Icons.trip_origin, color: Colors.green, size: 28),
              ),
              Marker(
                point: _dropoff,
                width: 36,
                height: 36,
                child: const Icon(Icons.place, color: Colors.red, size: 28),
              ),
              if (driverLocation != null)
                Marker(
                  point: LatLng(driverLocation!.lat, driverLocation!.lng),
                  width: 40,
                  height: 40,
                  child: Container(
                    decoration: BoxDecoration(
                      color: Colors.black,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 2),
                    ),
                    child: const Icon(Icons.directions_car, color: Colors.white, size: 22),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
