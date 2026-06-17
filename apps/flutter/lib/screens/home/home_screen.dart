import 'package:flutter/material.dart';
import '../../config/theme.dart';
import '../../data/mock_data.dart';
import '../../widgets/uber_search_bar.dart';
import '../plan/choose_ride_screen.dart';
import '../plan/plan_trip_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _topTab = 0;

  void _openPlan() {
    Navigator.push(context, MaterialPageRoute(builder: (_) => const PlanTripScreen()));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  _TopTab(
                    label: 'BC Taxi',
                    icon: Icons.directions_car,
                    active: _topTab == 0,
                    onTap: () => setState(() => _topTab = 0),
                  ),
                  const SizedBox(width: 24),
                  _TopTab(
                    label: 'Entregas',
                    icon: Icons.local_shipping_outlined,
                    active: _topTab == 1,
                    onTap: () => setState(() => _topTab = 1),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              UberSearchBar(onTap: _openPlan),
              const SizedBox(height: 16),
              _RecentCard(onTap: _openPlan, cardColor: theme.cardColor, borderColor: theme.dividerColor),
              const SizedBox(height: 16),
              _PromoCard(isDark: isDark, surfaceColor: theme.colorScheme.surface),
              const SizedBox(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Para si', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                  CircleAvatar(radius: 14, backgroundColor: theme.cardColor, child: const Icon(Icons.arrow_forward, size: 14)),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  _ServiceItem(label: 'Viajar', icon: Icons.directions_car, onTap: _openPlan, circleColor: theme.cardColor),
                  _ServiceItem(label: 'Reservar', icon: Icons.event, onTap: _openPlan, circleColor: theme.cardColor),
                  _ServiceItem(label: 'Moto', icon: Icons.two_wheeler, onTap: _openPlan, circleColor: theme.cardColor),
                  _ServiceItem(
                    label: 'Conforto',
                    icon: Icons.airline_seat_recline_normal,
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ChooseRideScreen())),
                    circleColor: theme.cardColor,
                  ),
                ],
              ),
              const SizedBox(height: 20),
              const Text('Poupe uma viagem', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: theme.cardColor, borderRadius: BorderRadius.circular(12)),
                child: const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Espere e poupe até 15%', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                    SizedBox(height: 4),
                    Text('Viagens flexíveis com preço menor', style: TextStyle(color: AppTheme.gray400, fontSize: 13)),
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

class _TopTab extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool active;
  final VoidCallback onTap;

  const _TopTab({required this.label, required this.icon, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Column(
        children: [
          Row(
            children: [
              Icon(icon, size: 18, color: active ? AppTheme.black : AppTheme.gray400),
              const SizedBox(width: 6),
              Text(label, style: TextStyle(fontWeight: active ? FontWeight.w800 : FontWeight.w600, color: active ? AppTheme.black : AppTheme.gray400)),
            ],
          ),
          const SizedBox(height: 8),
          if (active) Container(height: 3, width: 80, decoration: BoxDecoration(color: AppTheme.black, borderRadius: BorderRadius.circular(2))),
        ],
      ),
    );
  }
}

class _RecentCard extends StatelessWidget {
  final VoidCallback onTap;
  final Color cardColor;
  final Color borderColor;

  const _RecentCard({required this.onTap, required this.cardColor, required this.borderColor});

  @override
  Widget build(BuildContext context) {
    final loc = recentLocations.first;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Ink(
        decoration: BoxDecoration(
          border: Border.all(color: borderColor),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              CircleAvatar(backgroundColor: cardColor, child: const Icon(Icons.schedule, size: 18)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(loc.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                    Text(loc.address, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppTheme.gray400, fontSize: 13)),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: AppTheme.gray400),
            ],
          ),
        ),
      ),
    );
  }
}

class _PromoCard extends StatelessWidget {
  final bool isDark;
  final Color surfaceColor;

  const _PromoCard({required this.isDark, required this.surfaceColor});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: isDark ? const Color(0xFF2A2418) : const Color(0xFFFFF9E6),
      ),
      child: Row(
        children: [
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Conclua o seu pagamento de 0,68 R\$', style: TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    decoration: BoxDecoration(color: surfaceColor, borderRadius: BorderRadius.circular(20)),
                    child: const Text('Analisar', style: TextStyle(fontWeight: FontWeight.w700)),
                  ),
                ],
              ),
            ),
          ),
          Container(
            width: 90,
            height: 100,
            color: isDark ? const Color(0xFF3D3520) : const Color(0xFFFFF3C4),
            child: const Icon(Icons.notifications, size: 40, color: Color(0xFFFFC107)),
          ),
        ],
      ),
    );
  }
}

class _ServiceItem extends StatelessWidget {
  final String label;
  final IconData icon;
  final VoidCallback onTap;
  final Color circleColor;

  const _ServiceItem({required this.label, required this.icon, required this.onTap, required this.circleColor});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Column(
        children: [
          CircleAvatar(radius: 32, backgroundColor: circleColor, child: Icon(icon)),
          const SizedBox(height: 8),
          Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
