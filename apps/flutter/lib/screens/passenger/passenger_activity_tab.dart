import 'package:flutter/material.dart';

import '../../constants/passenger_data.dart';
import '../../theme/passenger_theme.dart';
import 'passenger_routes.dart';

class PassengerActivityTab extends StatelessWidget {
  const PassengerActivityTab({super.key});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Atividade', style: PassengerTheme.titleLarge),
              IconButton(
                onPressed: () => PassengerRoutes.openActivityFilter(context),
                icon: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(color: BcColors.grayLight, borderRadius: BorderRadius.circular(8)),
                  child: const Icon(Icons.tune, size: 20),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text('Anteriores', style: PassengerTheme.titleMedium.copyWith(fontSize: 16)),
          const SizedBox(height: 12),
          if (pastTrips.isNotEmpty) _FeaturedTripCard(trip: pastTrips.first),
          const SizedBox(height: 4),
          ...pastTrips.skip(1).map((t) => _TripListRow(trip: t)),
        ],
      ),
    );
  }
}

class _FeaturedTripCard extends StatelessWidget {
  const _FeaturedTripCard({required this.trip});

  final TripActivityItem trip;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: () => PassengerRoutes.openTripDetail(context, trip),
        borderRadius: BorderRadius.circular(16),
        child: Container(
          decoration: BoxDecoration(
            color: BcColors.grayLight,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                height: 130,
                margin: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: const Color(0xFFE8EDF2), borderRadius: BorderRadius.circular(12)),
                child: Stack(
                  children: [
                    CustomPaint(painter: _RoutePreviewPainter(), size: Size.infinite),
                    const Positioned(left: 12, top: 8, child: Text('BR-101', style: TextStyle(fontSize: 10, color: BcColors.gray, fontWeight: FontWeight.w600))),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(trip.displayTitle, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
                    const SizedBox(height: 6),
                    Text(trip.dateLabel, style: PassengerTheme.caption),
                    const SizedBox(height: 4),
                    Text(
                      trip.metaLabel != null ? '${trip.priceLabel} · ${trip.metaLabel}' : trip.priceLabel,
                      style: PassengerTheme.caption,
                    ),
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      onPressed: () => PassengerRoutes.rebookTrip(context, trip),
                      icon: const Icon(Icons.refresh, size: 16),
                      label: const Text('Reservar'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: BcColors.black,
                        backgroundColor: Colors.white,
                        side: const BorderSide(color: BcColors.border),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TripListRow extends StatelessWidget {
  const _TripListRow({required this.trip});

  final TripActivityItem trip;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => PassengerRoutes.openTripDetail(context, trip),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(color: BcColors.grayLight, borderRadius: BorderRadius.circular(10)),
              child: const Icon(Icons.directions_car_filled_outlined, size: 28),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(trip.destination, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                  const SizedBox(height: 2),
                  Text(trip.dateLabel, style: PassengerTheme.caption),
                  const SizedBox(height: 2),
                  Text('${trip.priceLabel}${trip.failed ? ' · Falhou' : ''}', style: PassengerTheme.caption),
                ],
              ),
            ),
            OutlinedButton.icon(
              onPressed: () => PassengerRoutes.rebookTrip(context, trip),
              icon: const Icon(Icons.refresh, size: 14),
              label: const Text('Reservar', style: TextStyle(fontSize: 13)),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size(0, 36),
                padding: const EdgeInsets.symmetric(horizontal: 12),
                foregroundColor: BcColors.black,
                backgroundColor: Colors.white,
                side: const BorderSide(color: BcColors.border),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RoutePreviewPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final route = Paint()
      ..color = BcColors.black
      ..strokeWidth = 3
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    final path = Path()
      ..moveTo(size.width * 0.2, size.height * 0.75)
      ..quadraticBezierTo(size.width * 0.45, size.height * 0.35, size.width * 0.78, size.height * 0.25);
    canvas.drawPath(path, route);
    canvas.drawCircle(Offset(size.width * 0.2, size.height * 0.75), 6, Paint()..color = BcColors.black);
    canvas.drawRect(Rect.fromCenter(center: Offset(size.width * 0.78, size.height * 0.25), width: 10, height: 10), Paint()..color = BcColors.black);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
