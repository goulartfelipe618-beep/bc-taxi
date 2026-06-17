import 'package:flutter/material.dart';
import '../../config/theme.dart';
import '../../data/mock_data.dart';
import '../../widgets/ride_option_tile.dart';

class ChooseRideScreen extends StatefulWidget {
  const ChooseRideScreen({super.key});

  @override
  State<ChooseRideScreen> createState() => _ChooseRideScreenState();
}

class _ChooseRideScreenState extends State<ChooseRideScreen> {
  String _selected = 'bcx';

  @override
  Widget build(BuildContext context) {
    final selected = rideOptions.firstWhere((r) => r.id == _selected);

    return Scaffold(
      body: Column(
        children: [
          Expanded(
            child: Stack(
              children: [
                Container(color: AppTheme.gray100, width: double.infinity),
                Positioned(
                  top: 48,
                  left: 16,
                  child: CircleAvatar(
                    backgroundColor: Colors.white,
                    child: IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.arrow_back)),
                  ),
                ),
                Positioned(
                  top: 48,
                  left: 72,
                  right: 16,
                  child: Material(
                    elevation: 2,
                    borderRadius: BorderRadius.circular(12),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          const Icon(Icons.place, color: AppTheme.gray400),
                          const SizedBox(width: 8),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(pickupAddress, style: const TextStyle(color: AppTheme.gray400, fontSize: 12)),
                              const Text('Hotel Blumenau', style: TextStyle(fontWeight: FontWeight.w700)),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                const Center(child: Material(elevation: 2, borderRadius: BorderRadius.all(Radius.circular(8)), child: Padding(padding: EdgeInsets.all(8), child: Text('5 min', style: TextStyle(fontWeight: FontWeight.w700))))),
              ],
            ),
          ),
          Container(
            decoration: const BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
            ),
            padding: const EdgeInsets.fromLTRB(8, 20, 8, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('Escolha uma viagem', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                SizedBox(
                  height: 220,
                  child: ListView.separated(
                    itemCount: rideOptions.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 4),
                    itemBuilder: (context, i) {
                      final opt = rideOptions[i];
                      return RideOptionTile(
                        option: opt,
                        selected: _selected == opt.id,
                        onTap: () => setState(() => _selected = opt.id),
                      );
                    },
                  ),
                ),
                const Divider(),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(4),
                      decoration: BoxDecoration(color: AppTheme.gray100, borderRadius: BorderRadius.circular(20)),
                      child: Row(
                        children: [
                          CircleAvatar(radius: 16, backgroundColor: AppTheme.black, child: const Icon(Icons.person, size: 16, color: Colors.white)),
                          const Padding(padding: EdgeInsets.all(8), child: Icon(Icons.work_outline, size: 16, color: AppTheme.gray400)),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Pessoal', style: TextStyle(fontWeight: FontWeight.w700)),
                          Text('PIX', style: TextStyle(color: AppTheme.gray400, fontSize: 13)),
                        ],
                      ),
                    ),
                    const Icon(Icons.chevron_right, color: AppTheme.gray400),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton(
                        onPressed: () {},
                        child: Text('Escolher ${selected.name}'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    OutlinedButton(
                      onPressed: () {},
                      style: OutlinedButton.styleFrom(minimumSize: const Size(52, 52), padding: EdgeInsets.zero),
                      child: const Icon(Icons.calendar_today_outlined),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
