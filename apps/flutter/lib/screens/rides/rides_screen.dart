import 'package:flutter/material.dart';
import '../../config/theme.dart';
import '../../data/mock_data.dart';

class RidesScreen extends StatelessWidget {
  const RidesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final featured = pastTrips.first;

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const Text('Atividade', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800)),
            const SizedBox(height: 20),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                border: Border.all(color: AppTheme.gray200),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    height: 120,
                    width: double.infinity,
                    decoration: BoxDecoration(color: AppTheme.gray100, borderRadius: BorderRadius.circular(8)),
                    child: const Icon(Icons.map, size: 32, color: AppTheme.gray400),
                  ),
                  const SizedBox(height: 12),
                  Text(featured['address']!, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  const SizedBox(height: 4),
                  Text('${featured['date']} · ${featured['price']}', style: const TextStyle(color: AppTheme.gray400)),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: () {},
                    icon: const Icon(Icons.refresh, size: 16),
                    label: const Text('Reservar'),
                    style: OutlinedButton.styleFrom(backgroundColor: AppTheme.gray100, side: BorderSide.none),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Anteriores', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                CircleAvatar(radius: 18, backgroundColor: AppTheme.gray100, child: const Icon(Icons.tune, size: 18)),
              ],
            ),
            ...pastTrips.map((trip) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  child: Row(
                    children: [
                      Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(color: AppTheme.gray100, borderRadius: BorderRadius.circular(8)),
                        child: Icon(trip['type'] == 'Moto' ? Icons.two_wheeler : Icons.directions_car),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(trip['address']!, style: const TextStyle(fontWeight: FontWeight.w700), maxLines: 1, overflow: TextOverflow.ellipsis),
                            Text(trip['date']!, style: const TextStyle(color: AppTheme.gray400, fontSize: 13)),
                            Text(trip['price']!, style: const TextStyle(color: AppTheme.gray400, fontSize: 13)),
                          ],
                        ),
                      ),
                      OutlinedButton(
                        onPressed: () {},
                        style: OutlinedButton.styleFrom(backgroundColor: AppTheme.gray100, side: BorderSide.none, padding: const EdgeInsets.symmetric(horizontal: 12)),
                        child: const Text('Reservar', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                      ),
                    ],
                  ),
                )),
          ],
        ),
      ),
    );
  }
}
