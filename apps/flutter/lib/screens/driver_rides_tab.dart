import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../services/ride_activity_service.dart';

class DriverRidesTab extends StatefulWidget {
  const DriverRidesTab({super.key});

  @override
  State<DriverRidesTab> createState() => _DriverRidesTabState();
}

class _DriverRidesTabState extends State<DriverRidesTab> {
  List<RideActivityItem> _items = [];
  bool _loading = true;
  String? _error;
  String _filter = 'all';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final token = context.read<AuthService>().token;
    if (token == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final service = RideActivityService(ApiClient(token), role: 'driver');
      final status = _filter == 'all' ? null : _filter;
      final result = await service.fetchRides(status: status);
      if (!mounted) return;
      setState(() {
        _items = result.items;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            FilledButton(onPressed: _load, child: const Text('Tentar novamente')),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('Corridas', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'all', label: Text('Todas')),
              ButtonSegment(value: 'completed', label: Text('Concluídas')),
              ButtonSegment(value: 'cancelled', label: Text('Canceladas')),
            ],
            selected: {_filter},
            onSelectionChanged: (s) {
              setState(() => _filter = s.first);
              _load();
            },
          ),
          const SizedBox(height: 16),
          if (_items.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 32),
              child: Center(child: Text('Nenhuma corrida no histórico')),
            )
          else
            ..._items.map(_buildRideTile),
        ],
      ),
    );
  }

  Widget _buildRideTile(RideActivityItem item) {
    final subtitle = [
      item.dateLabel,
      if (item.passengerName != null) item.passengerName,
      item.categoryLabel,
    ].whereType<String>().join(' · ');

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        title: Text(item.displayTitle, maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Text(subtitle),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            if (item.priceLabel != null)
              Text(item.priceLabel!, style: const TextStyle(fontWeight: FontWeight.w700)),
            Text(
              item.isCancelled ? 'Cancelada' : 'Concluída',
              style: TextStyle(
                fontSize: 12,
                color: item.isCancelled ? Colors.red.shade700 : Colors.green.shade700,
              ),
            ),
          ],
        ),
        isThreeLine: true,
      ),
    );
  }
}
