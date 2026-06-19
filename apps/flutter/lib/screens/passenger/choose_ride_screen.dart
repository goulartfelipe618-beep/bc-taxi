import 'package:flutter/material.dart';

import '../../constants/passenger_data.dart';
import '../../theme/passenger_theme.dart';

class ChooseRideScreen extends StatefulWidget {
  const ChooseRideScreen({
    super.key,
    required this.origin,
    required this.destination,
    required this.destinationAddress,
  });

  final String origin;
  final String destination;
  final String destinationAddress;

  @override
  State<ChooseRideScreen> createState() => _ChooseRideScreenState();
}

class _ChooseRideScreenState extends State<ChooseRideScreen> {
  String _selectedId = rideCategories.first.id;

  RideCategoryOption get _selected => rideCategories.firstWhere((r) => r.id == _selectedId);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BcColors.grayLight,
      body: Column(
        children: [
          Expanded(
            flex: 2,
            child: Stack(
              children: [
                Container(color: const Color(0xFFDCE3EA)),
                const Center(child: Icon(Icons.map_outlined, size: 64, color: BcColors.gray)),
                SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        CircleAvatar(
                          backgroundColor: Colors.white,
                          child: IconButton(
                            icon: const Icon(Icons.arrow_back, color: BcColors.black),
                            onPressed: () => Navigator.pop(context),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(999)),
                            child: Text(
                              widget.destination,
                              style: const TextStyle(fontWeight: FontWeight.w600),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            flex: 3,
            child: Container(
              width: double.infinity,
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
                    child: Text('Escolha uma corrida', style: PassengerTheme.titleMedium.copyWith(fontSize: 20)),
                  ),
                  Expanded(
                    child: ListView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      itemCount: rideCategories.length,
                      itemBuilder: (context, i) {
                        final r = rideCategories[i];
                        final selected = r.id == _selectedId;
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: Material(
                            color: selected ? BcColors.grayLight : Colors.white,
                            borderRadius: BorderRadius.circular(12),
                            child: InkWell(
                              onTap: () => setState(() => _selectedId = r.id),
                              borderRadius: BorderRadius.circular(12),
                              child: Container(
                                padding: const EdgeInsets.all(14),
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(color: selected ? BcColors.black : BcColors.border, width: selected ? 2 : 1),
                                ),
                                child: Row(
                                  children: [
                                    Container(
                                      width: 56,
                                      height: 40,
                                      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(8)),
                                      child: const Icon(Icons.directions_car_filled, size: 32),
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Row(
                                            children: [
                                              Text(r.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                                              const SizedBox(width: 4),
                                              Icon(Icons.person_outline, size: 14, color: BcColors.gray),
                                              Text('${r.capacity}', style: PassengerTheme.caption),
                                            ],
                                          ),
                                          Text(r.etaLabel, style: PassengerTheme.caption),
                                          if (r.badge != null) ...[
                                            const SizedBox(height: 4),
                                            Text(
                                              r.badge!,
                                              style: TextStyle(
                                                fontSize: 12,
                                                fontWeight: FontWeight.w600,
                                                color: r.badgeIsGreen ? BcColors.green : BcColors.blue,
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
                      },
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(4),
                          decoration: BoxDecoration(color: BcColors.grayLight, borderRadius: BorderRadius.circular(8)),
                          child: Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(color: BcColors.black, borderRadius: BorderRadius.circular(6)),
                                child: const Icon(Icons.person_outline, color: Colors.white, size: 18),
                              ),
                              Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 10),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text('Pessoal', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                                    Text('PIX', style: PassengerTheme.caption.copyWith(fontSize: 12)),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                    child: Row(
                      children: [
                        Expanded(
                          child: FilledButton(
                            onPressed: () {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text('${_selected.name} solicitado para ${widget.destination}')),
                              );
                            },
                            style: FilledButton.styleFrom(
                              backgroundColor: BcColors.black,
                              padding: const EdgeInsets.symmetric(vertical: 16),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                            child: Text('Escolher ${_selected.name}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                          ),
                        ),
                        const SizedBox(width: 10),
                        OutlinedButton(
                          onPressed: () {},
                          style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.all(16),
                            side: const BorderSide(color: BcColors.border),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          child: const Icon(Icons.event_outlined),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
