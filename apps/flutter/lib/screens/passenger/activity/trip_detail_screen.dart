import 'package:flutter/material.dart';

import '../../../constants/passenger_data.dart';
import '../../../theme/passenger_theme.dart';
import '../../../widgets/passenger/bc_subpage_scaffold.dart';
import '../passenger_routes.dart';

class TripDetailScreen extends StatelessWidget {
  const TripDetailScreen({super.key, required this.trip});

  final TripActivityItem trip;

  @override
  Widget build(BuildContext context) {
    return BcSubpageScaffold(
      title: 'Detalhes da viagem',
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            height: 180,
            decoration: BoxDecoration(color: const Color(0xFFDCE3EA), borderRadius: BorderRadius.circular(12)),
            child: const Center(child: Icon(Icons.map_outlined, size: 48, color: BcColors.gray)),
          ),
          const SizedBox(height: 16),
          Text(trip.destination, style: PassengerTheme.titleMedium),
          Text(trip.address, style: PassengerTheme.caption),
          const SizedBox(height: 8),
          Text('${trip.dateLabel} · ${trip.priceLabel}', style: PassengerTheme.caption),
          if (trip.failed) ...[
            const SizedBox(height: 8),
            Text('Viagem não concluída', style: TextStyle(color: Colors.red.shade700, fontWeight: FontWeight.w600)),
          ],
          const Divider(height: 32),
          _row('Origem', trip.origin),
          _row('Categoria', trip.category),
          _row('Pagamento', trip.paymentMethod),
          if (trip.driverName != null) _row('Motorista', trip.driverName!),
          const SizedBox(height: 24),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => PassengerRoutes.rebookTrip(context, trip),
                  child: const Text('Reservar novamente'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton(
                  onPressed: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Recibo enviado por e-mail'))),
                  style: FilledButton.styleFrom(backgroundColor: BcColors.black),
                  child: const Text('Obter recibo'),
                ),
              ),
            ],
          ),
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
