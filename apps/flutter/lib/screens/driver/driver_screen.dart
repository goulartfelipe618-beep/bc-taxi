import 'dart:async';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:provider/provider.dart';
import '../../config/theme.dart';
import '../../models/driver.dart';
import '../../models/trip.dart';
import '../../providers/auth_provider.dart';
import '../trip/trip_screen.dart';

class DriverScreen extends StatefulWidget {
  const DriverScreen({super.key});

  @override
  State<DriverScreen> createState() => _DriverScreenState();
}

class _DriverScreenState extends State<DriverScreen> {
  Driver? _driver;
  List<Trip> _requests = [];
  Trip? _activeTrip;
  bool _loading = true;
  Timer? _locationTimer;

  @override
  void initState() {
    super.initState();
    _load();
    _setupSocket();
  }

  void _setupSocket() {
    final auth = context.read<AuthProvider>();
    auth.socket.onNewTripRequest = (_) => _loadRequests();
    auth.socket.onTripUpdated = (_) => _load();
  }

  Future<void> _load() async {
    final auth = context.read<AuthProvider>();
    final driverService = DriverService(auth.apiClient);
    final tripService = TripService(auth.apiClient);
    try {
      _driver = await driverService.getMe();
      _activeTrip = await tripService.getActiveTrip();
      if (_driver?.isOnline == true) {
        await _loadRequests();
        _startLocationUpdates();
      }
    } catch (_) {}
    setState(() => _loading = false);
  }

  Future<void> _loadRequests() async {
    final auth = context.read<AuthProvider>();
    final tripService = TripService(auth.apiClient);
    try {
      final requests = await tripService.getRequestedTrips();
      setState(() => _requests = requests);
    } catch (_) {}
  }

  void _startLocationUpdates() {
    _locationTimer?.cancel();
    _locationTimer = Timer.periodic(const Duration(seconds: 10), (_) async {
      final auth = context.read<AuthProvider>();
      final driverService = DriverService(auth.apiClient);
      try {
        final pos = await Geolocator.getCurrentPosition();
        await driverService.updateLocation(
          pos.latitude,
          pos.longitude,
          pos.heading,
        );
        auth.socket.emitDriverLocation(
          pos.latitude,
          pos.longitude,
          pos.heading,
        );
      } catch (_) {}
    });
  }

  Future<void> _toggleOnline(bool value) async {
    final auth = context.read<AuthProvider>();
    final driverService = DriverService(auth.apiClient);
    try {
      _driver = await driverService.setOnline(value);
      if (value) {
        await _loadRequests();
        _startLocationUpdates();
      } else {
        _locationTimer?.cancel();
        setState(() => _requests = []);
      }
      setState(() {});
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Erro: $e')),
      );
    }
  }

  Future<void> _acceptTrip(String tripId) async {
    final auth = context.read<AuthProvider>();
    final tripService = TripService(auth.apiClient);
    try {
      await tripService.acceptTrip(tripId);
      if (mounted) {
        Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => TripScreen(tripId: tripId)),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Erro: $e')),
      );
    }
  }

  @override
  void dispose() {
    _locationTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (_activeTrip != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Motorista')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('Corrida ativa', style: TextStyle(fontSize: 18)),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => TripScreen(tripId: _activeTrip!.id),
                    ),
                  ),
                  child: const Text('Ver corrida em andamento'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Motorista')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Card(
              child: SwitchListTile(
                title: Text(
                  _driver?.isOnline == true
                      ? 'Você está online'
                      : 'Você está offline',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                subtitle: Text(
                  _driver?.isOnline == true
                      ? 'Aguardando solicitações'
                      : 'Fique online para receber corridas',
                ),
                value: _driver?.isOnline ?? false,
                activeColor: AppTheme.primary,
                onChanged: _toggleOnline,
              ),
            ),
            if (_driver?.isOnline == true) ...[
              const SizedBox(height: 16),
              const Text(
                'Solicitações',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 8),
              Expanded(
                child: _requests.isEmpty
                    ? const Center(child: Text('Nenhuma solicitação'))
                    : ListView.builder(
                        itemCount: _requests.length,
                        itemBuilder: (context, index) {
                          final trip = _requests[index];
                          return Card(
                            child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  ClipRRect(
                                    borderRadius: BorderRadius.circular(8),
                                    child: SizedBox(
                                      height: 100,
                                      child: GoogleMap(
                                        initialCameraPosition: CameraPosition(
                                          target: LatLng(
                                            trip.pickupLat,
                                            trip.pickupLng,
                                          ),
                                          zoom: 13,
                                        ),
                                        scrollGesturesEnabled: false,
                                        zoomGesturesEnabled: false,
                                        markers: {
                                          Marker(
                                            markerId: const MarkerId('p'),
                                            position: LatLng(
                                              trip.pickupLat,
                                              trip.pickupLng,
                                            ),
                                          ),
                                          Marker(
                                            markerId: const MarkerId('d'),
                                            position: LatLng(
                                              trip.dropoffLat,
                                              trip.dropoffLng,
                                            ),
                                          ),
                                        },
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 12),
                                  Text(
                                    'R\$ ${trip.estimatedPrice?.toStringAsFixed(2) ?? '—'}',
                                    style: const TextStyle(
                                      fontSize: 20,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  Text(trip.dropoffAddress ?? 'Destino'),
                                  const SizedBox(height: 12),
                                  ElevatedButton(
                                    onPressed: () => _acceptTrip(trip.id),
                                    child: const Text('Aceitar'),
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
