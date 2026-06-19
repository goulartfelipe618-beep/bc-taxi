import 'package:flutter/material.dart';

import '../../constants/passenger_data.dart';
import '../../theme/passenger_theme.dart';
import 'plan_trip_screen.dart';

class PassengerServicesTab extends StatelessWidget {
  const PassengerServicesTab({super.key});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Serviços', style: PassengerTheme.titleLarge),
          const SizedBox(height: 8),
          Text('Corridas com veículos na cidade', style: PassengerTheme.caption),
          const SizedBox(height: 24),
          ...rideCategories.map((r) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Material(
                color: BcColors.grayLight,
                borderRadius: BorderRadius.circular(12),
                child: InkWell(
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PlanTripScreen())),
                  borderRadius: BorderRadius.circular(12),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      children: [
                        Container(
                          width: 56,
                          height: 56,
                          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
                          child: const Icon(Icons.directions_car_filled_outlined, size: 32),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Text(r.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                                  const SizedBox(width: 6),
                                  Icon(Icons.person_outline, size: 14, color: BcColors.gray),
                                  Text(' ${r.capacity}', style: PassengerTheme.caption),
                                ],
                              ),
                              const SizedBox(height: 4),
                              Text(r.etaLabel, style: PassengerTheme.caption),
                              if (r.badge != null) ...[
                                const SizedBox(height: 6),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: (r.badgeIsGreen ? BcColors.green : BcColors.blue).withValues(alpha: 0.12),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text(
                                    r.badge!,
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                      color: r.badgeIsGreen ? BcColors.green : BcColors.blue,
                                    ),
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                        Text(r.priceLabel, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                      ],
                    ),
                  ),
                ),
              ),
            );
          }),
        ],
      ),
    );
  }
}
