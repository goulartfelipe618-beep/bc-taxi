import 'package:flutter/material.dart';

import '../../constants/passenger_data.dart';
import '../../models/trip_draft.dart';
import '../../services/trip_resolver.dart';
import '../../theme/passenger_theme.dart';
import 'choose_ride_screen.dart';

class ConfirmPickupScreen extends StatefulWidget {
  const ConfirmPickupScreen({
    super.key,
    required this.trip,
    this.preselectedCategoryId,
  });

  final TripDraft trip;
  final String? preselectedCategoryId;

  @override
  State<ConfirmPickupScreen> createState() => _ConfirmPickupScreenState();
}

class _ConfirmPickupScreenState extends State<ConfirmPickupScreen> {
  int _selectedIndex = 0;
  bool _loading = false;

  PickupSpot get _selected => pickupSpots[_selectedIndex];

  Future<void> _confirm() async {
    setState(() => _loading = true);
    final trip = await TripResolver.build(
      pickupAddress: _selected.label,
      dropoffName: widget.trip.dropoffName,
      dropoffAddress: widget.trip.dropoffAddress,
      scheduled: widget.trip.scheduled,
    );
    if (!mounted) return;
    setState(() => _loading = false);
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => ChooseRideScreen(
          trip: trip,
          preselectedCategoryId: widget.preselectedCategoryId,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFDCE3EA),
      body: Stack(
        children: [
          Column(
            children: [
              Expanded(
                child: Stack(
                  children: [
                    Container(color: const Color(0xFFDCE3EA)),
                    CustomPaint(painter: _MapPlaceholderPainter(selectedIndex: _selectedIndex), size: Size.infinite),
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
                            const Spacer(),
                            CircleAvatar(
                              backgroundColor: Colors.white,
                              child: IconButton(
                                icon: const Icon(Icons.layers_outlined, color: BcColors.black),
                                onPressed: () {},
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                width: double.infinity,
                decoration: const BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
                ),
                padding: const EdgeInsets.fromLTRB(16, 20, 16, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('Confirmar local de recolha', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18)),
                    const SizedBox(height: 12),
                    ...List.generate(pickupSpots.length, (i) {
                      final spot = pickupSpots[i];
                      final selected = i == _selectedIndex;
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Material(
                          color: selected ? BcColors.grayLight : Colors.white,
                          borderRadius: BorderRadius.circular(12),
                          child: InkWell(
                            onTap: () => setState(() => _selectedIndex = i),
                            borderRadius: BorderRadius.circular(12),
                            child: Container(
                              width: double.infinity,
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: selected ? BcColors.black : BcColors.border, width: selected ? 2 : 1),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(spot.label, style: const TextStyle(fontWeight: FontWeight.w600)),
                                  Text(spot.subtitle, style: PassengerTheme.caption),
                                ],
                              ),
                            ),
                          ),
                        ),
                      );
                    }),
                    const SizedBox(height: 8),
                    FilledButton(
                      onPressed: _loading ? null : _confirm,
                      style: FilledButton.styleFrom(
                        backgroundColor: BcColors.black,
                        minimumSize: const Size(double.infinity, 52),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: _loading
                          ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Text('Confirmar e continuar', style: TextStyle(fontWeight: FontWeight.w700)),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MapPlaceholderPainter extends CustomPainter {
  _MapPlaceholderPainter({required this.selectedIndex});

  final int selectedIndex;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = const Color(0xFFB8C5D0);
    canvas.drawCircle(Offset(size.width * 0.5, size.height * 0.45), 12, paint);
    canvas.drawCircle(Offset(size.width * (0.35 + selectedIndex * 0.1), size.height * 0.5), 8, paint..color = BcColors.black);
  }

  @override
  bool shouldRepaint(covariant _MapPlaceholderPainter old) => old.selectedIndex != selectedIndex;
}
