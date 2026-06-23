import 'package:flutter/material.dart';

import '../../../services/api_client.dart';
import '../../../services/receipt_service.dart';
import '../../../theme/passenger_theme.dart';

class RideReceiptScreen extends StatefulWidget {
  const RideReceiptScreen({
    super.key,
    required this.rideId,
    required this.token,
  });

  final String rideId;
  final String token;

  @override
  State<RideReceiptScreen> createState() => _RideReceiptScreenState();
}

class _RideReceiptScreenState extends State<RideReceiptScreen> {
  late final ReceiptService _receipts = ReceiptService(ApiClient(widget.token));
  RideReceipt? _receipt;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final receipt = await _receipts.fetchReceipt(widget.rideId);
      if (!mounted) return;
      setState(() {
        _receipt = receipt;
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Recibo da viagem')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : ListView(
                  padding: const EdgeInsets.all(20),
                  children: [
                    Text('Recibo ${_receipt!.receiptNumber}', style: PassengerTheme.titleMedium),
                    const SizedBox(height: 8),
                    Text(_receipt!.amountLabel, style: PassengerTheme.titleLarge),
                    const SizedBox(height: 16),
                    if (_receipt!.paymentMethodType != null)
                      Text('Pagamento: ${_receipt!.paymentMethodType}', style: PassengerTheme.caption),
                    Text(
                      'Emitido em ${_receipt!.issuedAt.substring(0, 19).replaceAll('T', ' ')}',
                      style: PassengerTheme.caption,
                    ),
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: () {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text('Recibo ${_receipt!.receiptNumber} guardado no histórico'),
                          ),
                        );
                      },
                      style: FilledButton.styleFrom(backgroundColor: BcColors.black),
                      child: const Text('Confirmar'),
                    ),
                  ],
                ),
    );
  }
}
