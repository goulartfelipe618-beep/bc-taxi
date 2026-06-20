import 'dart:async';

import 'package:geolocator/geolocator.dart';

import 'driver_service.dart';

class DriverLocationTracker {
  DriverLocationTracker(this._service);

  final DriverService _service;
  Timer? _timer;
  String? _rideId;

  Future<Position?> getCurrentPosition() async {
    if (!await Geolocator.isLocationServiceEnabled()) return null;

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
      return null;
    }

    return Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
    );
  }

  Future<void> start({String? rideId}) async {
    stop();
    _rideId = rideId;
    await _ping();
    _timer = Timer.periodic(const Duration(seconds: 12), (_) => _ping());
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
    _rideId = null;
  }

  Future<void> _ping() async {
    try {
      final pos = await getCurrentPosition();
      if (pos == null) return;
      await _service.updateLocation(
        lat: pos.latitude,
        lng: pos.longitude,
        rideId: _rideId,
      );
    } catch (_) {
      /* ignore transient GPS/network errors */
    }
  }
}
