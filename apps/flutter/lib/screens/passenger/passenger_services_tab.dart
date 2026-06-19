import 'package:flutter/material.dart';

import '../../constants/passenger_data.dart';
import '../../theme/passenger_theme.dart';
import 'passenger_routes.dart';

class PassengerServicesTab extends StatelessWidget {
  const PassengerServicesTab({super.key});

  void _onService(BuildContext context, VehicleService service) {
    switch (service.id) {
      case 'reserve':
        PassengerRoutes.openSchedule(context);
      case 'travel':
        PassengerRoutes.openPlanTrip(context);
      default:
        PassengerRoutes.openPlanTrip(context, preselectedCategoryId: service.categoryId);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Serviços', style: PassengerTheme.titleLarge),
          const SizedBox(height: 8),
          Text('Vá onde quiser com veículos BC Taxi', style: PassengerTheme.titleMedium.copyWith(fontSize: 15)),
          const SizedBox(height: 24),
          Row(
            children: serviceGridPrimary
                .map(
                  (s) => Expanded(
                    child: Padding(
                      padding: EdgeInsets.only(right: s != serviceGridPrimary.last ? 10 : 0),
                      child: _ServiceTile(service: s, large: true, onTap: () => _onService(context, s)),
                    ),
                  ),
                )
                .toList(),
          ),
          const SizedBox(height: 10),
          Row(
            children: serviceGridSecondary
                .map(
                  (s) => Expanded(
                    child: Padding(
                      padding: EdgeInsets.only(right: s != serviceGridSecondary.last ? 10 : 0),
                      child: _ServiceTile(service: s, large: false, onTap: () => _onService(context, s)),
                    ),
                  ),
                )
                .toList(),
          ),
          const SizedBox(height: 20),
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton.icon(
              onPressed: () => PassengerRoutes.openPlanTrip(context),
              style: FilledButton.styleFrom(
                backgroundColor: BcColors.blue,
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
              ),
              icon: Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), shape: BoxShape.circle),
                child: const Icon(Icons.arrow_forward, size: 18),
              ),
              label: const Text('A procurar', style: TextStyle(fontWeight: FontWeight.w700)),
            ),
          ),
        ],
      ),
    );
  }
}

class _ServiceTile extends StatelessWidget {
  const _ServiceTile({required this.service, required this.large, required this.onTap});

  final VehicleService service;
  final bool large;
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
          height: large ? 118 : 100,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(service.icon, size: large ? 38 : 30),
              const SizedBox(height: 10),
              Text(service.label, style: TextStyle(fontWeight: FontWeight.w600, fontSize: large ? 14 : 13), textAlign: TextAlign.center),
            ],
          ),
        ),
      ),
    );
  }
}
