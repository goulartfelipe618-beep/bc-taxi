import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../constants/passenger_data.dart';
import '../../services/api_client.dart';
import '../../services/auth_service.dart';
import '../../services/ride_activity_service.dart';
import '../../services/trip_resolver.dart';
import '../../theme/passenger_theme.dart';
import '../../widgets/passenger/bc_subpage_scaffold.dart';
import '../ride_activity_detail_screen.dart';
import 'activity/ride_receipt_screen.dart';
import 'choose_ride_screen.dart';
import 'passenger_routes.dart';

class TripDetailScreen extends StatefulWidget {
  const TripDetailScreen({super.key, required this.trip});

  final TripActivityItem trip;

  @override
  State<TripDetailScreen> createState() => _TripDetailScreenState();
}

class _TripDetailScreenState extends State<TripDetailScreen> {
  RideActivityDetail? _detail;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    if (widget.trip.rideId != null) _loadDetail();
  }

  Future<void> _loadDetail() async {
    final token = context.read<AuthService>().token;
    if (token == null || widget.trip.rideId == null) return;
    setState(() => _loading = true);
    try {
      final detail = await RideActivityService(ApiClient(token), role: 'passenger')
          .fetchRideDetail(widget.trip.rideId!);
      if (!mounted) return;
      setState(() {
        _detail = detail;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  Future<void> _rebook() async {
    final token = context.read<AuthService>().token;
    final rideId = widget.trip.rideId;
    if (token != null && rideId != null) {
      try {
        final draft = await RideActivityService(ApiClient(token), role: 'passenger').fetchRebookDraft(rideId);
        final trip = await TripResolver.build(
          pickupAddress: draft.pickupAddress,
          dropoffName: draft.dropoffName,
          dropoffAddress: draft.dropoffAddress,
        );
        if (!mounted) return;
        await Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => ChooseRideScreen(trip: trip, preselectedCategoryId: draft.categoryCode),
          ),
        );
        return;
      } catch (_) {}
    }
    if (!mounted) return;
    PassengerRoutes.rebookTrip(context, widget.trip);
  }

  Future<void> _openReceipt() async {
    final token = context.read<AuthService>().token;
    final rideId = widget.trip.rideId;
    if (token == null || rideId == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Recibo indisponível')));
      return;
    }
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => RideReceiptScreen(rideId: rideId, token: token)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final trip = widget.trip;
    final detail = _detail;

    return BcSubpageScaffold(
      title: 'Detalhes da viagem',
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Container(
                  height: 180,
                  decoration: BoxDecoration(color: const Color(0xFFDCE3EA), borderRadius: BorderRadius.circular(12)),
                  child: const Center(child: Icon(Icons.map_outlined, size: 48, color: BcColors.gray)),
                ),
                const SizedBox(height: 16),
                Text(detail?.dropoffAddress ?? trip.destination, style: PassengerTheme.titleMedium),
                Text(detail?.pickupAddress ?? trip.address, style: PassengerTheme.caption),
                const SizedBox(height: 8),
                Text(
                  '${trip.dateLabel} · ${detail?.fareLabel ?? trip.priceLabel}',
                  style: PassengerTheme.caption,
                ),
                if (trip.failed || (detail?.isCancelled ?? false)) ...[
                  const SizedBox(height: 8),
                  Text('Viagem não concluída', style: TextStyle(color: Colors.red.shade700, fontWeight: FontWeight.w600)),
                ],
                const Divider(height: 32),
                _row('Origem', detail?.pickupAddress ?? trip.origin),
                _row('Categoria', detail?.categoryLabel ?? trip.category),
                _row('Pagamento', detail?.paymentMethodLabel ?? trip.paymentMethod),
                if ((detail?.driverName ?? trip.driverName) != null)
                  _row('Motorista', detail?.driverName ?? trip.driverName!),
                const SizedBox(height: 24),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _rebook,
                        child: const Text('Reservar novamente'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: FilledButton(
                        onPressed: (detail?.receiptId != null || trip.rideId != null) ? _openReceipt : null,
                        style: FilledButton.styleFrom(backgroundColor: BcColors.black),
                        child: const Text('Obter recibo'),
                      ),
                    ),
                  ],
                ),
                if (trip.rideId != null) ...[
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => RideActivityDetailScreen(rideId: trip.rideId!, role: 'passenger'),
                      ),
                    ),
                    child: const Text('Ver detalhes completos'),
                  ),
                ],
              ],
            ),
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          Expanded(child: Text(label, style: PassengerTheme.caption)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
