import 'package:flutter/material.dart';
import '../../config/theme.dart';
import '../../data/mock_data.dart';
import 'choose_ride_screen.dart';

class PlanTripScreen extends StatelessWidget {
  const PlanTripScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Row(
                children: [
                  IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.arrow_back)),
                  const Expanded(child: Text('Planeie a sua viagem', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 17))),
                  const SizedBox(width: 48),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  _Pill(label: 'Recolher agora', icon: Icons.schedule, dark: true),
                  const SizedBox(width: 10),
                  _Pill(label: 'Para mim', icon: Icons.person_outline),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  border: Border.all(color: AppTheme.black, width: 2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    Column(
                      children: [
                        Container(width: 10, height: 10, decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: AppTheme.black, width: 2))),
                        Container(width: 2, height: 24, color: AppTheme.black),
                        Container(width: 8, height: 8, color: AppTheme.black),
                      ],
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(pickupAddress, style: const TextStyle(fontWeight: FontWeight.w600)),
                          const SizedBox(height: 12),
                          const Text('Para onde?', style: TextStyle(color: AppTheme.gray400, fontSize: 16)),
                        ],
                      ),
                    ),
                    CircleAvatar(
                      radius: 18,
                      backgroundColor: Colors.white,
                      child: CircleAvatar(radius: 17, backgroundColor: AppTheme.gray100, child: const Icon(Icons.add, size: 18)),
                    ),
                  ],
                ),
              ),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  const Row(
                    children: [
                      Icon(Icons.star_border, size: 18),
                      SizedBox(width: 8),
                      Text('Locais guardados', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                    ],
                  ),
                  ...recentLocations.map((loc) => ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: SizedBox(
                          width: 40,
                          child: Column(
                            children: [
                              const Icon(Icons.schedule, size: 18, color: AppTheme.gray400),
                              Text(loc.distance, style: const TextStyle(fontSize: 11, color: AppTheme.gray400)),
                            ],
                          ),
                        ),
                        title: Text(loc.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                        subtitle: Text(loc.address, maxLines: 1, overflow: TextOverflow.ellipsis),
                        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ChooseRideScreen())),
                      )),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool dark;

  const _Pill({required this.label, required this.icon, this.dark = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: dark ? AppTheme.black : AppTheme.gray100,
        borderRadius: BorderRadius.circular(24),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: dark ? Colors.white : AppTheme.black),
          const SizedBox(width: 6),
          Text(label, style: TextStyle(fontWeight: FontWeight.w600, color: dark ? Colors.white : AppTheme.black)),
          Icon(Icons.expand_more, size: 16, color: dark ? Colors.white : AppTheme.black),
        ],
      ),
    );
  }
}
