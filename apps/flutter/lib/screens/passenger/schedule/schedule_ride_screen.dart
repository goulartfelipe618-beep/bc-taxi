import 'package:flutter/material.dart';

import '../../../constants/passenger_data.dart';
import '../../../theme/passenger_theme.dart';
import '../../../widgets/passenger/bc_widgets.dart';
import '../passenger_routes.dart';
import '../widgets/passenger_sheets.dart';

class ScheduleRideScreen extends StatefulWidget {
  const ScheduleRideScreen({super.key, this.destination});

  final PlaceItem? destination;

  @override
  State<ScheduleRideScreen> createState() => _ScheduleRideScreenState();
}

class _ScheduleRideScreenState extends State<ScheduleRideScreen> {
  DateTime? _scheduledAt;
  PlaceItem? _destination;

  @override
  void initState() {
    super.initState();
    _destination = widget.destination;
  }

  String get _timeLabel {
    if (_scheduledAt == null) return 'Escolher data e hora';
    final d = _scheduledAt!;
    return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')} · ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.white,
        foregroundColor: BcColors.black,
        elevation: 0,
        title: const Text('Agendar corrida', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.event),
            title: const Text('Data e hora', style: TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text(_timeLabel),
            trailing: const Icon(Icons.chevron_right),
            onTap: () async {
              final dt = await showScheduleTimeSheet(context);
              if (dt != null) setState(() => _scheduledAt = dt);
            },
          ),
          const Divider(),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.place_outlined),
            title: const Text('Destino', style: TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text(_destination?.name ?? 'Escolher destino'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () async {
              await Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => _DestinationPicker(
                    onPick: (p) => setState(() => _destination = p),
                  ),
                ),
              );
            },
          ),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: _destination == null || _scheduledAt == null
                ? null
                : () {
                    PassengerRoutes.openChooseRide(
                      context,
                      origin: defaultOrigin,
                      destination: _destination!,
                      scheduled: true,
                    );
                  },
            style: FilledButton.styleFrom(backgroundColor: BcColors.black, padding: const EdgeInsets.symmetric(vertical: 16)),
            child: const Text('Continuar'),
          ),
        ],
      ),
    );
  }
}

class _DestinationPicker extends StatelessWidget {
  const _DestinationPicker({required this.onPick});

  final ValueChanged<PlaceItem> onPick;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Escolher destino')),
      body: ListView(
        children: [...recentPlaces, ...savedPlaces]
            .map(
              (p) => PlaceListTile(
                name: p.name,
                address: p.address,
                distanceKm: p.distanceKm,
                onTap: () {
                  onPick(p);
                  Navigator.pop(context);
                },
              ),
            )
            .toList(),
      ),
    );
  }
}
