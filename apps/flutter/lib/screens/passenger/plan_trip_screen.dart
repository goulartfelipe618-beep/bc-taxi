import 'package:flutter/material.dart';

import '../../constants/passenger_data.dart';
import '../../theme/passenger_theme.dart';
import '../../widgets/passenger/bc_widgets.dart';
import 'choose_ride_screen.dart';

class PlanTripScreen extends StatelessWidget {
  const PlanTripScreen({super.key, this.initialDestination});

  final String? initialDestination;

  void _goToChooseRide(BuildContext context, PlaceItem place) {
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
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.white,
        foregroundColor: BcColors.black,
        elevation: 0,
        leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => Navigator.pop(context)),
        title: const Text('Planeie a sua viagem', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18)),
        centerTitle: true,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              BcPillButton(icon: Icons.access_time, label: 'Recolher agora', onTap: () {}),
              const SizedBox(width: 10),
              BcPillButton(icon: Icons.person_outline, label: 'Para mim', onTap: () {}),
            ],
          ),
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
            decoration: BoxDecoration(
              border: Border.all(color: BcColors.black, width: 1.5),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Column(
                  children: [
                    Container(width: 10, height: 10, decoration: const BoxDecoration(color: BcColors.black, shape: BoxShape.circle)),
                    Container(width: 2, height: 36, color: BcColors.black),
                    Container(width: 10, height: 10, decoration: BoxDecoration(border: Border.all(color: BcColors.black, width: 2))),
                  ],
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(defaultOrigin, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                      const SizedBox(height: 18),
                      Text(
                        initialDestination ?? 'Para onde?',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: initialDestination != null ? FontWeight.w600 : FontWeight.w400,
                          color: initialDestination != null ? BcColors.black : BcColors.gray,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(onPressed: () {}, icon: const Icon(Icons.add_circle_outline)),
              ],
            ),
          ),
          const SizedBox(height: 24),
          Row(
            children: [
              const Icon(Icons.star_outline, size: 20),
              const SizedBox(width: 8),
              Text('Locais guardados', style: PassengerTheme.titleMedium.copyWith(fontSize: 16)),
            ],
          ),
          const Divider(height: 24),
          ...savedPlaces.map((p) => PlaceListTile(
                name: p.name,
                address: p.address,
                leading: Icons.star_outline,
                onTap: () => _goToChooseRide(context, p),
              )),
          const Divider(height: 24),
          ...recentPlaces.map((p) => PlaceListTile(
                name: p.name,
                address: p.address,
                distanceKm: p.distanceKm,
                onTap: () => _goToChooseRide(context, p),
              )),
        ],
      ),
    );
  }
}
