import 'package:flutter/material.dart';

import '../../constants/passenger_data.dart';
import '../../theme/passenger_theme.dart';
import 'choose_ride_screen.dart';

class ConfirmPickupScreen extends StatefulWidget {
  const ConfirmPickupScreen({
    super.key,
    required this.origin,
    required this.destination,
    required this.destinationAddress,
    this.preselectedCategoryId,
    this.scheduled = false,
  });

  final String origin;
  final String destination;
  final String destinationAddress;
  final String? preselectedCategoryId;
  final bool scheduled;

  @override
  State<ConfirmPickupScreen> createState() => _ConfirmPickupScreenState();
}

class _ConfirmPickupScreenState extends State<ConfirmPickupScreen> {
  int _selectedIndex = 0;

  PickupSpot get _selected => pickupSpots[_selectedIndex];

  void _confirm() {
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => ChooseRideScreen(
          origin: _selected.label,
          destination: widget.destination,
          destinationAddress: widget.destinationAddress,
          preselectedCategoryId: widget.preselectedCategoryId,
          scheduled: widget.scheduled,
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
                    Positioned(
                      top: MediaQuery.of(context).size.height * 0.28,
                      left: 0,
                      right: 0,
                      child: Center(
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                          decoration: BoxDecoration(color: BcColors.black, borderRadius: BorderRadius.circular(999)),
                          child: Text('Recolha em ${widget.origin.split(',').first}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 13)),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          DraggableScrollableSheet(
            initialChildSize: 0.42,
            minChildSize: 0.38,
            maxChildSize: 0.55,
            builder: (context, scrollController) => Container(
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
              ),
              child: ListView(
                controller: scrollController,
                padding: const EdgeInsets.fromLTRB(16, 20, 16, 16),
                children: [
                  Row(
                    children: [
                      Expanded(child: Text('Confirme o ponto de recolha', style: PassengerTheme.titleMedium.copyWith(fontSize: 18), textAlign: TextAlign.center)),
                      IconButton(
                        icon: const Icon(Icons.search),
                        onPressed: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Pesquisar endereço de recolha'))),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  ...List.generate(pickupSpots.length, (i) {
                    final spot = pickupSpots[i];
                    final selected = i == _selectedIndex;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Material(
                        color: selected ? Colors.white : BcColors.grayLight,
                        borderRadius: BorderRadius.circular(12),
                        child: InkWell(
                          onTap: () => setState(() => _selectedIndex = i),
                          borderRadius: BorderRadius.circular(12),
                          child: Container(
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: selected ? BcColors.black : Colors.transparent, width: 2),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(spot.label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                                const SizedBox(height: 4),
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
                    onPressed: _confirm,
                    style: FilledButton.styleFrom(
                      backgroundColor: BcColors.black,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: const Text('Confirmar recolha', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
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

class _MapPlaceholderPainter extends CustomPainter {
  _MapPlaceholderPainter({required this.selectedIndex});

  final int selectedIndex;

  @override
  void paint(Canvas canvas, Size size) {
    final road = Paint()..color = Colors.white..strokeWidth = 28..strokeCap = StrokeCap.round;
    canvas.drawLine(Offset(size.width * 0.35, size.height * 0.15), Offset(size.width * 0.55, size.height * 0.85), road);

    final dotLine = Paint()
      ..color = BcColors.black
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;
    for (var y = size.height * 0.45; y < size.height * 0.62; y += 8) {
      canvas.drawLine(Offset(size.width * 0.48, y), Offset(size.width * 0.48, y + 4), dotLine);
    }

    final spots = [0.52, 0.58, 0.64];
    for (var i = 0; i < spots.length; i++) {
      final y = size.height * spots[i];
      final x = size.width * 0.48;
      final selected = i == selectedIndex;
      canvas.drawCircle(Offset(x, y), selected ? 10 : 8, Paint()..color = selected ? BcColors.black : Colors.white);
      canvas.drawCircle(
        Offset(x, y),
        selected ? 10 : 8,
        Paint()
          ..color = selected ? BcColors.black : BcColors.black
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2,
      );
      if (!selected) {
        canvas.drawCircle(Offset(x, y), 3, Paint()..color = BcColors.black);
      } else {
        canvas.drawCircle(Offset(x, y), 3, Paint()..color = Colors.white);
      }
    }

    canvas.drawCircle(Offset(size.width * 0.48, size.height * 0.38), 8, Paint()..color = BcColors.blue);
  }

  @override
  bool shouldRepaint(covariant _MapPlaceholderPainter oldDelegate) => oldDelegate.selectedIndex != selectedIndex;
}
