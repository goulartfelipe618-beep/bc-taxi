import 'package:flutter/material.dart';

import '../../constants/passenger_data.dart';
import '../../models/trip_draft.dart';
import '../../services/trip_resolver.dart';
import '../../theme/passenger_theme.dart';
import '../../widgets/passenger/bc_widgets.dart';
import 'passenger_routes.dart';
import 'widgets/passenger_sheets.dart';

class PlanTripScreen extends StatefulWidget {
  const PlanTripScreen({super.key, this.initialDestination, this.preselectedCategoryId});

  final String? initialDestination;
  final String? preselectedCategoryId;

  @override
  State<PlanTripScreen> createState() => _PlanTripScreenState();
}

class _PlanTripScreenState extends State<PlanTripScreen> {
  late String _origin = defaultOrigin;
  String? _destination;
  String _pickupLabel = 'Recolher agora';
  String _profileLabel = 'Para mim';
  final List<String> _stops = [];
  bool _navigating = false;

  @override
  void initState() {
    super.initState();
    _destination = widget.initialDestination;
  }

  Future<void> _goToChooseRide(PlaceItem place) async {
    if (_navigating) return;
    setState(() => _navigating = true);
    final trip = await TripResolver.build(
      pickupAddress: _origin,
      dropoffName: place.name,
      dropoffAddress: place.address,
    );
    if (!mounted) return;
    setState(() => _navigating = false);
    PassengerRoutes.openConfirmPickup(
      context,
      trip: trip,
      preselectedCategoryId: widget.preselectedCategoryId,
    );
  }

  Future<void> _editOrigin() async {
    final result = await showEditTextSheet(context, title: 'Origem', initial: _origin, hint: 'Endereço de recolha');
    if (result != null) setState(() => _origin = result);
  }

  Future<void> _editDestination() async {
    final result = await showEditTextSheet(context, title: 'Destino', initial: _destination ?? '', hint: 'Para onde?');
    if (result != null) {
      _goToChooseRide(PlaceItem(name: result, address: result));
    }
  }

  Future<void> _addStop() async {
    final result = await showEditTextSheet(context, title: 'Paragem intermédia', initial: '', hint: 'Adicionar paragem');
    if (result != null) setState(() => _stops.add(result));
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
      body: Stack(
        children: [
          ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Row(
                children: [
                  BcPillButton(
                    icon: Icons.access_time,
                    label: _pickupLabel,
                    onTap: () async {
                      if (_pickupLabel == 'Recolher agora') {
                        final choice = await showPickupTimeSheet(context, _pickupLabel);
                        if (choice == 'Recolher mais tarde') {
                          if (!context.mounted) return;
                          PassengerRoutes.openSchedule(context);
                        }
                      } else {
                        final choice = await showPickupTimeSheet(context, _pickupLabel);
                        if (choice != null) setState(() => _pickupLabel = choice);
                      }
                    },
                  ),
                  const SizedBox(width: 10),
                  BcPillButton(
                    icon: Icons.person_outline,
                    label: _profileLabel,
                    onTap: () async {
                      final choice = await showProfilePickerSheet(context, _profileLabel);
                      if (choice != null) setState(() => _profileLabel = choice);
                    },
                  ),
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
                        Container(width: 2, height: 36 + (_stops.length * 24), color: BcColors.black),
                        Container(width: 10, height: 10, decoration: BoxDecoration(border: Border.all(color: BcColors.black, width: 2))),
                      ],
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          InkWell(onTap: _editOrigin, child: Text(_origin, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15))),
                          ..._stops.map(
                            (s) => Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: Text(s, style: PassengerTheme.caption),
                            ),
                          ),
                          const SizedBox(height: 18),
                          InkWell(
                            onTap: _editDestination,
                            child: Text(
                              _destination ?? 'Para onde?',
                              style: TextStyle(
                                fontSize: 15,
                                fontWeight: _destination != null ? FontWeight.w600 : FontWeight.w400,
                                color: _destination != null ? BcColors.black : BcColors.gray,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(onPressed: _addStop, icon: const Icon(Icons.add_circle_outline)),
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
              ...savedPlaces.map((p) => PlaceListTile(name: p.name, address: p.address, leading: Icons.star_outline, onTap: () => _goToChooseRide(p))),
              const Divider(height: 24),
              ...recentPlaces.map(
                (p) => PlaceListTile(name: p.name, address: p.address, distanceKm: p.distanceKm, onTap: () => _goToChooseRide(p)),
              ),
            ],
          ),
          if (_navigating)
            const ColoredBox(
              color: Color(0x44FFFFFF),
              child: Center(child: CircularProgressIndicator(color: BcColors.black)),
            ),
        ],
      ),
    );
  }
}
