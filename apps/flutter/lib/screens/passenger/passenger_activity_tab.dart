import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../constants/passenger_data.dart';
import '../../services/api_client.dart';
import '../../services/auth_service.dart';
import '../../services/ride_activity_service.dart' as api;
import '../../theme/passenger_theme.dart';
import 'passenger_routes.dart';

class PassengerActivityTab extends StatefulWidget {
  const PassengerActivityTab({super.key});

  @override
  State<PassengerActivityTab> createState() => _PassengerActivityTabState();
}

class _PassengerActivityTabState extends State<PassengerActivityTab> {
  List<TripActivityItem> _trips = [];
  bool _loading = true;
  bool _useFallback = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final token = context.read<AuthService>().token;
    if (token == null) {
      setState(() {
        _trips = pastTrips;
        _useFallback = true;
        _loading = false;
      });
      return;
    }

    setState(() => _loading = true);
    try {
      final service = api.RideActivityService(ApiClient(token), role: 'passenger');
      final result = await service.fetchRides();
      if (!mounted) return;
      setState(() {
        _trips = result.items.asMap().entries.map((entry) {
          final item = entry.value;
          return TripActivityItem(
            rideId: item.rideId,
            destination: item.displayTitle,
            address: item.dropoffAddress ?? item.displayTitle,
            dateLabel: item.dateLabel,
            priceLabel: item.priceLabel ?? '—',
            origin: item.pickupAddress ?? defaultOrigin,
            category: item.categoryLabel,
            driverName: item.driverName,
            metaLabel: item.driverName,
            featured: entry.key == 0,
            failed: item.isCancelled,
          );
        }).toList();
        _useFallback = false;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _trips = pastTrips;
        _useFallback = true;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const SafeArea(child: Center(child: CircularProgressIndicator()));
    }

    return SafeArea(
      child: RefreshIndicator(
        onRefresh: _load,
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
            if (_useFallback)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text('Exibindo dados de demonstração', style: PassengerTheme.caption),
              ),
            const SizedBox(height: 8),
            Text('Anteriores', style: PassengerTheme.titleMedium.copyWith(fontSize: 16)),
            const SizedBox(height: 12),
            if (_trips.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 32),
                child: Center(child: Text('Nenhuma viagem anterior')),
              )
            else ...[
              if (_trips.first.featured) _FeaturedTripCard(trip: _trips.first),
              const SizedBox(height: 4),
              ..._trips.skip(_trips.first.featured ? 1 : 0).map((t) => _TripListRow(trip: t)),
            ],
          ],
        ),
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
