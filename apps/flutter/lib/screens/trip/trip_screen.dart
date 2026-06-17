import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:provider/provider.dart';
import '../../config/theme.dart';
import '../../models/trip.dart';
import '../../providers/auth_provider.dart';

class TripScreen extends StatefulWidget {
  final String tripId;

  const TripScreen({super.key, required this.tripId});

  @override
  State<TripScreen> createState() => _TripScreenState();
}

class _TripScreenState extends State<TripScreen> {
  Trip? _trip;
  bool _loading = true;
  bool _actionLoading = false;

  @override
  void initState() {
    super.initState();
    _load();
    _setupSocket();
  }

  void _setupSocket() {
    final auth = context.read<AuthProvider>();
    auth.socket.joinTrip(widget.tripId);
    auth.socket.onTripUpdated = (trip) {
      if (trip.id == widget.tripId) {
        setState(() => _trip = trip);
      }
    };
  }

  Future<void> _load() async {
    final auth = context.read<AuthProvider>();
    final tripService = TripService(auth.apiClient);
    try {
      _trip = await tripService.getTrip(widget.tripId);
    } catch (_) {}
    setState(() => _loading = false);
  }

  Future<void> _updateStatus(String status, {String? reason}) async {
    setState(() => _actionLoading = true);
    final auth = context.read<AuthProvider>();
    final tripService = TripService(auth.apiClient);
    try {
      _trip = await tripService.updateStatus(
        widget.tripId,
        status,
        cancellationReason: reason,
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Erro: $e')),
      );
    }
    setState(() => _actionLoading = false);
  }

  void _cancel() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancelar corrida'),
        content: const Text('Tem certeza que deseja cancelar?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Não')),
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              _updateStatus('cancelled', reason: 'Cancelado pelo usuário');
            },
            child: const Text('Sim, cancelar'),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    context.read<AuthProvider>().socket.leaveTrip(widget.tripId);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading || _trip == null) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    final trip = _trip!;
    final auth = context.read<AuthProvider>();
    final isDriver = (auth.user?.isDriver ?? false) && trip.driverId == auth.user?.id;
    final isPassenger = trip.passengerId == auth.user?.id;
    final statusLabel = AppTheme.tripStatusLabels[trip.status] ?? trip.status;

    return Scaffold(
      appBar: AppBar(title: const Text('Corrida')),
      body: Column(
        children: [
          Expanded(
            child: GoogleMap(
              initialCameraPosition: CameraPosition(
                target: LatLng(trip.pickupLat, trip.pickupLng),
                zoom: 13,
              ),
              markers: {
                Marker(
                  markerId: const MarkerId('pickup'),
                  position: LatLng(trip.pickupLat, trip.pickupLng),
                  icon: BitmapDescriptor.defaultMarkerWithHue(
                    BitmapDescriptor.hueYellow,
                  ),
                ),
                Marker(
                  markerId: const MarkerId('dropoff'),
                  position: LatLng(trip.dropoffLat, trip.dropoffLng),
                  icon: BitmapDescriptor.defaultMarkerWithHue(
                    BitmapDescriptor.hueRed,
                  ),
                ),
              },
            ),
          ),
          Container(
            padding: const EdgeInsets.all(24),
            decoration: const BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFF8E1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    statusLabel,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
                const SizedBox(height: 16),
                Text('● ${trip.pickupAddress ?? "Origem"}'),
                const SizedBox(height: 8),
                Text('● ${trip.dropoffAddress ?? "Destino"}'),
                if (trip.displayPrice != null) ...[
                  const SizedBox(height: 16),
                  Text(
                    'R\$ ${trip.displayPrice!.toStringAsFixed(2)}',
                    style: const TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
                if (trip.isActive && isDriver && trip.status == 'accepted')
                  _actionButton('Cheguei no local', () => _updateStatus('driver_arrived')),
                if (trip.isActive && isDriver && trip.status == 'driver_arrived')
                  _actionButton('Iniciar corrida', () => _updateStatus('in_progress')),
                if (trip.isActive && isDriver && trip.status == 'in_progress')
                  _actionButton('Finalizar corrida', () => _updateStatus('completed')),
                if (trip.isActive && (isPassenger || isDriver))
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: OutlinedButton(
                      onPressed: _actionLoading ? null : _cancel,
                      child: const Text('Cancelar corrida'),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _actionButton(String label, VoidCallback onPressed) {
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: ElevatedButton(
        onPressed: _actionLoading ? null : onPressed,
        child: _actionLoading
            ? const SizedBox(
                height: 20,
                width: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : Text(label),
      ),
    );
  }
}
