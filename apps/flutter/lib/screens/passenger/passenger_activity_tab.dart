import 'package:flutter/material.dart';

import '../../constants/passenger_data.dart';
import '../../theme/passenger_theme.dart';
class PassengerActivityTab extends StatelessWidget {
  const PassengerActivityTab({super.key});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Atividade', style: PassengerTheme.titleLarge),
              IconButton(
                onPressed: () {},
                icon: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(color: BcColors.grayLight, borderRadius: BorderRadius.circular(8)),
                  child: const Icon(Icons.tune, size: 20),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text('Anteriores', style: PassengerTheme.titleMedium.copyWith(fontSize: 16)),
          const SizedBox(height: 12),
          if (pastTrips.isNotEmpty) _FeaturedTripCard(trip: pastTrips.first),
          const SizedBox(height: 8),
          ...pastTrips.skip(1).map((t) => _TripListRow(trip: t)),
        ],
      ),
    );
  }
}

class _FeaturedTripCard extends StatelessWidget {
  const _FeaturedTripCard({required this.trip});

  final TripActivityItem trip;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: PassengerTheme.card,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            height: 120,
            margin: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: BcColors.grayLight,
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Center(child: Icon(Icons.map_outlined, size: 40, color: BcColors.gray)),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(trip.destination, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
                const SizedBox(height: 4),
                Text(trip.address, style: PassengerTheme.caption),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Text('${trip.dateLabel} · ${trip.priceLabel}', style: PassengerTheme.caption),
                    const Spacer(),
                    OutlinedButton.icon(
                      onPressed: () {},
                      icon: const Icon(Icons.refresh, size: 16),
                      label: const Text('Reservar'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: BcColors.black,
                        side: const BorderSide(color: BcColors.border),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _TripListRow extends StatelessWidget {
  const _TripListRow({required this.trip});

  final TripActivityItem trip;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () {},
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 14),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(color: BcColors.grayLight, borderRadius: BorderRadius.circular(8)),
              child: const Icon(Icons.directions_car_outlined, size: 26),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(trip.destination, style: const TextStyle(fontWeight: FontWeight.w600)),
                  Text('${trip.dateLabel} · ${trip.priceLabel}${trip.failed ? ' · Falhou' : ''}', style: PassengerTheme.caption),
                ],
              ),
            ),
            OutlinedButton(
              onPressed: () {},
              style: OutlinedButton.styleFrom(
                minimumSize: const Size(0, 36),
                padding: const EdgeInsets.symmetric(horizontal: 14),
                foregroundColor: BcColors.black,
                side: const BorderSide(color: BcColors.border),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
              ),
              child: const Text('Reservar', style: TextStyle(fontSize: 13)),
            ),
          ],
        ),
      ),
    );
  }
}
