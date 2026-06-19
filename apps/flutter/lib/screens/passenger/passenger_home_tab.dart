import 'package:flutter/material.dart';

import '../../constants/passenger_data.dart';
import '../../theme/passenger_theme.dart';
import '../../widgets/passenger/bc_widgets.dart';
import 'plan_trip_screen.dart';
import 'choose_ride_screen.dart';

class PassengerHomeTab extends StatelessWidget {
  const PassengerHomeTab({super.key});

  void _openPlanTrip(BuildContext context, {PlaceItem? destination}) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => PlanTripScreen(initialDestination: destination?.name)),
    );
  }

  void _openChooseRide(BuildContext context, PlaceItem place) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ChooseRideScreen(
          origin: defaultOrigin,
          destination: place.name,
          destinationAddress: place.address,
        ),
      ),
    );
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
              Expanded(child: BcSearchBar(hint: 'Para onde?', onTap: () => _openPlanTrip(context))),
              const SizedBox(width: 10),
              BcOutlinePillButton(icon: Icons.event_outlined, label: 'Mais tarde', onTap: () => _openPlanTrip(context)),
            ],
          ),
          const SizedBox(height: 12),
          if (recentPlaces.isNotEmpty)
            Material(
              color: BcColors.grayLight,
              borderRadius: BorderRadius.circular(12),
              child: InkWell(
                onTap: () => _openChooseRide(context, recentPlaces.first),
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
                            Text(recentPlaces.first.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                            Text(recentPlaces.first.address, style: PassengerTheme.caption, maxLines: 1, overflow: TextOverflow.ellipsis),
                          ],
                        ),
                      ),
                      const Icon(Icons.chevron_right, color: BcColors.gray),
                    ],
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
                  onTap: () => _openPlanTrip(context),
                  borderRadius: BorderRadius.circular(12),
                  child: SizedBox(
                    width: 72,
                    child: Column(
                      children: [
                        Container(
                          width: 64,
                          height: 64,
                          decoration: BoxDecoration(
                            color: BcColors.grayLight,
                            borderRadius: BorderRadius.circular(16),
                          ),
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
        ],
      ),
    );
  }
}
