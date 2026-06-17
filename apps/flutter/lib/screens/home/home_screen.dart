import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:provider/provider.dart';
import '../../config/theme.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/vehicle_type_selector.dart';
import '../trip/trip_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  GoogleMapController? _mapController;
  LatLng? _pickup;
  LatLng? _dropoff;
  String _vehicleType = 'economy';
  Map<String, double> _prices = {};
  bool _selectingDropoff = false;
  bool _loading = true;
  bool _requesting = false;
  final _dropoffController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _initLocation();
  }

  Future<void> _initLocation() async {
    final permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      await Geolocator.requestPermission();
    }
    final pos = await Geolocator.getCurrentPosition();
    setState(() {
      _pickup = LatLng(pos.latitude, pos.longitude);
      _loading = false;
    });
    _mapController?.animateCamera(CameraUpdate.newLatLng(_pickup!));
  }

  Future<void> _updateEstimates() async {
    if (_pickup == null || _dropoff == null) return;
    final auth = context.read<AuthProvider>();
    final tripService = TripService(auth.apiClient);
    try {
      final estimates = await tripService.estimateFare(
        pickupLat: _pickup!.latitude,
        pickupLng: _pickup!.longitude,
        dropoffLat: _dropoff!.latitude,
        dropoffLng: _dropoff!.longitude,
      );
      setState(() => _prices = estimates);
    } catch (_) {}
  }

  Future<void> _requestRide() async {
    if (_pickup == null || _dropoff == null) return;
    setState(() => _requesting = true);
    final auth = context.read<AuthProvider>();
    final tripService = TripService(auth.apiClient);
    try {
      final trip = await tripService.createTrip(
        pickupLat: _pickup!.latitude,
        pickupLng: _pickup!.longitude,
        dropoffLat: _dropoff!.latitude,
        dropoffLng: _dropoff!.longitude,
        vehicleType: _vehicleType,
        pickupAddress: 'Minha localização',
        dropoffAddress: _dropoffController.text.isNotEmpty
            ? _dropoffController.text
            : 'Destino selecionado',
      );
      if (mounted) {
        Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => TripScreen(tripId: trip.id)),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erro: $e')),
        );
      }
    } finally {
      setState(() => _requesting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading || _pickup == null) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('BC Taxi')),
      body: Stack(
        children: [
          GoogleMap(
            initialCameraPosition: CameraPosition(target: _pickup!, zoom: 14),
            onMapCreated: (c) => _mapController = c,
            myLocationEnabled: true,
            myLocationButtonEnabled: true,
            markers: {
              if (_pickup != null)
                Marker(
                  markerId: const MarkerId('pickup'),
                  position: _pickup!,
                  icon: BitmapDescriptor.defaultMarkerWithHue(
                    BitmapDescriptor.hueYellow,
                  ),
                ),
              if (_dropoff != null)
                Marker(
                  markerId: const MarkerId('dropoff'),
                  position: _dropoff!,
                  icon: BitmapDescriptor.defaultMarkerWithHue(
                    BitmapDescriptor.hueRed,
                  ),
                ),
            },
            onTap: (latLng) {
              if (!_selectingDropoff) return;
              setState(() {
                _dropoff = latLng;
                _selectingDropoff = false;
              });
              _updateEstimates();
            },
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Container(
              padding: const EdgeInsets.all(20),
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black12,
                    blurRadius: 12,
                    offset: Offset(0, -4),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'Onde você quer ir?',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _dropoffController,
                    decoration: const InputDecoration(
                      hintText: 'Digite o destino (opcional)',
                    ),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton(
                    onPressed: () => setState(() => _selectingDropoff = true),
                    child: Text(
                      _selectingDropoff
                          ? 'Toque no mapa para marcar'
                          : 'Selecionar destino no mapa',
                    ),
                  ),
                  if (_dropoff != null) ...[
                    const SizedBox(height: 16),
                    VehicleTypeSelector(
                      selected: _vehicleType,
                      prices: _prices,
                      onSelect: (t) => setState(() => _vehicleType = t),
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton(
                      onPressed: _requesting ? null : _requestRide,
                      child: _requesting
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : Text(
                              'Solicitar corrida — R\$ ${_prices[_vehicleType]?.toStringAsFixed(2) ?? '—'}',
                            ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}