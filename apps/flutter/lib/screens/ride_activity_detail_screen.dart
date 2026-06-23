import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../services/api_client.dart';
import '../../services/auth_service.dart';
import '../../services/ride_activity_service.dart';
import '../passenger/activity/ride_receipt_screen.dart';

class RideActivityDetailScreen extends StatefulWidget {
  const RideActivityDetailScreen({
    super.key,
    required this.rideId,
    this.role = 'passenger',
  });

  final String rideId;
  final String role;

  @override
  State<RideActivityDetailScreen> createState() => _RideActivityDetailScreenState();
}

class _RideActivityDetailScreenState extends State<RideActivityDetailScreen> {
  RideActivityDetail? _detail;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final token = context.read<AuthService>().token;
    if (token == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final detail = await RideActivityService(ApiClient(token), role: widget.role).fetchRideDetail(widget.rideId);
      if (!mounted) return;
      setState(() {
        _detail = detail;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _openReceipt() async {
    final token = context.read<AuthService>().token;
    if (token == null) return;
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => RideReceiptScreen(rideId: widget.rideId, token: token),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Detalhes da corrida')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(_error!, textAlign: TextAlign.center),
                      const SizedBox(height: 12),
                      FilledButton(onPressed: _load, child: const Text('Tentar novamente')),
                    ],
                  ),
                )
              : _buildContent(_detail!),
    );
  }

  Widget _buildContent(RideActivityDetail detail) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          height: 140,
          decoration: BoxDecoration(color: Colors.grey.shade200, borderRadius: BorderRadius.circular(12)),
          child: const Center(child: Icon(Icons.route_outlined, size: 48)),
        ),
        const SizedBox(height: 16),
        Text(detail.dropoffAddress, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
        Text(detail.pickupAddress, style: TextStyle(color: Colors.grey[600])),
        const SizedBox(height: 8),
        if (detail.fareLabel != null) Text(detail.fareLabel!, style: const TextStyle(fontWeight: FontWeight.w700)),
        if (detail.isCancelled)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              detail.cancelReason ?? 'Corrida cancelada',
              style: TextStyle(color: Colors.red.shade700, fontWeight: FontWeight.w600),
            ),
          ),
        const Divider(height: 32),
        _row('Categoria', detail.categoryLabel),
        if (detail.paymentMethodLabel != null) _row('Pagamento', detail.paymentMethodLabel!),
        if (detail.driverName != null) _row('Motorista', detail.driverName!),
        if (detail.driverEarningsLabel != null) _row('Seu ganho', detail.driverEarningsLabel!),
        if (detail.reviewPending)
          const Padding(
            padding: EdgeInsets.only(top: 12),
            child: Text('Avaliação pendente para esta corrida'),
          ),
        const SizedBox(height: 24),
        if (widget.role == 'passenger' && detail.rebookEnabled)
          FilledButton(
            onPressed: () => Navigator.pop(context, detail.rideId),
            child: const Text('Reservar novamente'),
          ),
        if (widget.role == 'passenger' && detail.receiptId != null) ...[
          const SizedBox(height: 10),
          OutlinedButton(onPressed: _openReceipt, child: const Text('Ver recibo')),
        ],
      ],
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(child: Text(label, style: TextStyle(color: Colors.grey[600]))),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
