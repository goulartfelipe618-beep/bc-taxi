import 'package:flutter/material.dart';

import '../../constants/passenger_data.dart';
import '../../theme/passenger_theme.dart';
import 'passenger_routes.dart';

class PassengerServicesTab extends StatelessWidget {
  const PassengerServicesTab({super.key});

  void _openCategory(BuildContext context, RideCategoryOption category) {
    PassengerRoutes.openPlanTrip(context, preselectedCategoryId: category.id);
  }

  @override
  Widget build(BuildContext context) {
    final primary = rideCategories.take(3).toList();

    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Serviços', style: PassengerTheme.titleLarge),
          const SizedBox(height: 8),
          Text('Vá onde quiser com veículos BC Taxi', style: PassengerTheme.caption),
          const SizedBox(height: 24),
          Row(
            children: [
              Expanded(child: _LargeServiceCard(category: primary[0], onTap: () => _openCategory(context, primary[0]))),
              const SizedBox(width: 10),
              Expanded(child: _LargeServiceCard(category: primary[1], onTap: () => _openCategory(context, primary[1]))),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(child: _LargeServiceCard(category: primary[2], onTap: () => _openCategory(context, primary[2]))),
              const SizedBox(width: 10),
              Expanded(
                child: Material(
                  color: BcColors.grayLight,
                  borderRadius: BorderRadius.circular(12),
                  child: InkWell(
                    onTap: () => PassengerRoutes.openSchedule(context),
                    borderRadius: BorderRadius.circular(12),
                    child: const SizedBox(
                      height: 120,
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.event_outlined, size: 36),
                          SizedBox(height: 8),
                          Text('Reservar', style: TextStyle(fontWeight: FontWeight.w700)),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          Text('Todas as categorias', style: PassengerTheme.titleMedium),
          const SizedBox(height: 12),
          ...rideCategories.map((r) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Material(
                color: BcColors.grayLight,
                borderRadius: BorderRadius.circular(12),
                child: InkWell(
                  onTap: () => _openCategory(context, r),
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
                              if (r.description != null) Text(r.description!, style: PassengerTheme.caption),
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

class _LargeServiceCard extends StatelessWidget {
  const _LargeServiceCard({required this.category, required this.onTap});

  final RideCategoryOption category;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: BcColors.grayLight,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          height: 120,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.directions_car_filled_outlined, size: 36),
              const SizedBox(height: 8),
              Text(category.name, style: const TextStyle(fontWeight: FontWeight.w700)),
              Text(category.priceLabel, style: PassengerTheme.caption),
            ],
          ),
        ),
      ),
    );
  }
}
