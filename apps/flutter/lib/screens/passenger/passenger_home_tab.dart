import 'package:flutter/material.dart';

import '../../constants/passenger_data.dart';
import '../../theme/passenger_theme.dart';
import '../../widgets/passenger/bc_widgets.dart';
import 'passenger_routes.dart';

class PassengerHomeTab extends StatelessWidget {
  const PassengerHomeTab({super.key});

  void _onServiceTap(BuildContext context, VehicleService service) {
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
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          const SizedBox(height: 4),
          Text('Corridas', style: PassengerTheme.titleMedium.copyWith(fontSize: 22, fontWeight: FontWeight.w800)),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(child: BcSearchBar(hint: 'Para onde?', onTap: () => PassengerRoutes.openPlanTrip(context))),
              const SizedBox(width: 10),
              BcOutlinePillButton(
                icon: Icons.event_outlined,
                label: 'Mais tarde',
                onTap: () => PassengerRoutes.openSchedule(context),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ...recentPlaces.take(3).map(
                (p) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Material(
                    color: BcColors.grayLight,
                    borderRadius: BorderRadius.circular(12),
                    child: InkWell(
                      onTap: () => PassengerRoutes.openChooseRide(context, destination: p),
                      borderRadius: BorderRadius.circular(12),
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Row(
                          children: [
                            const Icon(Icons.history, size: 20),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(p.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                                  Text(p.address, style: PassengerTheme.caption, maxLines: 1, overflow: TextOverflow.ellipsis),
                                ],
                              ),
                            ),
                            const Icon(Icons.chevron_right, color: BcColors.gray),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
          const SizedBox(height: 28),
          Text('Para você', style: PassengerTheme.titleMedium),
          const SizedBox(height: 14),
          SizedBox(
            height: 96,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: vehicleServices.length,
              separatorBuilder: (_, _) => const SizedBox(width: 20),
              itemBuilder: (context, i) {
                final s = vehicleServices[i];
                return InkWell(
                  onTap: () => _onServiceTap(context, s),
                  borderRadius: BorderRadius.circular(12),
                  child: SizedBox(
                    width: 72,
                    child: Column(
                      children: [
                        Container(
                          width: 64,
                          height: 64,
                          decoration: BoxDecoration(color: BcColors.grayLight, borderRadius: BorderRadius.circular(16)),
                          child: Icon(s.icon, size: 30, color: BcColors.black),
                        ),
                        const SizedBox(height: 8),
                        Text(s.label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500), textAlign: TextAlign.center),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 28),
          Text('Outros produtos', style: PassengerTheme.titleMedium),
          const SizedBox(height: 12),
          SizedBox(
            height: 120,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: promoBanners.length,
              separatorBuilder: (_, _) => const SizedBox(width: 12),
              itemBuilder: (context, i) => Container(
                width: 260,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: BcColors.grayLight, borderRadius: BorderRadius.circular(12)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.local_offer_outlined),
                    const Spacer(),
                    Text(promoBanners[i], style: const TextStyle(fontWeight: FontWeight.w700)),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
