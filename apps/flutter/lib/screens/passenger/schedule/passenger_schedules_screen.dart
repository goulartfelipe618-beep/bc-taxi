import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../services/api_client.dart';
import '../../services/auth_service.dart';
import '../../services/passenger_schedule_production_service.dart';
import '../../theme/passenger_theme.dart';
import '../passenger_routes.dart';
import 'schedule/schedule_ride_screen.dart';
import 'widgets/passenger_sheets.dart';

class PassengerSchedulesScreen extends StatefulWidget {
  const PassengerSchedulesScreen({super.key});

  @override
  State<PassengerSchedulesScreen> createState() => _PassengerSchedulesScreenState();
}

class _PassengerSchedulesScreenState extends State<PassengerSchedulesScreen> {
  PassengerScheduleDashboard? _dashboard;
  bool _loading = true;
  String? _error;

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
      final dashboard = await PassengerScheduleProductionService(ApiClient(token)).fetchDashboard();
      if (!mounted) return;
      setState(() {
        _dashboard = dashboard;
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

  Future<void> _reschedule(EnrichedScheduledRide schedule) async {
    final token = context.read<AuthService>().token;
    if (token == null) return;
    final dt = await showScheduleTimeSheet(context);
    if (dt == null) return;
    try {
      await PassengerScheduleProductionService(ApiClient(token)).reschedule(schedule.id, dt);
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Future<void> _cancel(EnrichedScheduledRide schedule) async {
    final token = context.read<AuthService>().token;
    if (token == null) return;
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancelar agendamento?'),
        content: Text('${schedule.dropoffAddress ?? schedule.categoryLabel}\n${schedule.scheduledLabel}'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Voltar')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Cancelar')),
        ],
      ),
    );
    if (confirm != true) return;
    try {
      await PassengerScheduleProductionService(ApiClient(token)).cancel(schedule.id);
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Minhas reservas', style: TextStyle(fontWeight: FontWeight.w700)),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const ScheduleRideScreen()),
            ).then((_) => _load()),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(_error!, textAlign: TextAlign.center),
                      const SizedBox(height: 12),
                      FilledButton(onPressed: _load, child: const Text('Tentar novamente')),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  child: _buildContent(_dashboard!),
                ),
    );
  }

  Widget _buildContent(PassengerScheduleDashboard dashboard) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (dashboard.reminders.isNotEmpty) ...[
          Card(
            color: Colors.blue.shade50,
            child: ListTile(
              leading: const Icon(Icons.notifications_active_outlined),
              title: Text(dashboard.reminders.first['title'] as String? ?? 'Lembrete'),
              subtitle: Text(dashboard.reminders.first['body'] as String? ?? ''),
            ),
          ),
          const SizedBox(height: 16),
        ],
        Text('Próximas', style: PassengerTheme.titleMedium),
        const SizedBox(height: 8),
        if (dashboard.upcoming.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(child: Text('Nenhuma reserva futura')),
          )
        else
          ...dashboard.upcoming.map((s) => _ScheduleCard(
                schedule: s,
                onReschedule: s.canReschedule ? () => _reschedule(s) : null,
                onCancel: s.canCancel ? () => _cancel(s) : null,
              )),
        const SizedBox(height: 20),
        Text('Anteriores', style: PassengerTheme.titleMedium),
        const SizedBox(height: 8),
        if (dashboard.past.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Text('Sem histórico de reservas', style: TextStyle(color: Colors.grey)),
          )
        else
          ...dashboard.past.map((s) => _ScheduleCard(schedule: s)),
      ],
    );
  }
}

class _ScheduleCard extends StatelessWidget {
  const _ScheduleCard({
    required this.schedule,
    this.onReschedule,
    this.onCancel,
  });

  final EnrichedScheduledRide schedule;
  final VoidCallback? onReschedule;
  final VoidCallback? onCancel;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    schedule.dropoffAddress ?? schedule.categoryLabel,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                Chip(
                  label: Text(schedule.statusLabel, style: const TextStyle(fontSize: 12)),
                  visualDensity: VisualDensity.compact,
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(schedule.scheduledLabel, style: PassengerTheme.caption),
            if (schedule.fareLabel != null) Text(schedule.fareLabel!, style: PassengerTheme.caption),
            if (schedule.minutesUntilPickup > 0 && schedule.status == 'confirmed')
              Text('Em ${schedule.minutesUntilPickup} min', style: PassengerTheme.caption),
            if (onReschedule != null || onCancel != null) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  if (onReschedule != null)
                    TextButton(onPressed: onReschedule, child: const Text('Reagendar')),
                  if (onCancel != null)
                    TextButton(onPressed: onCancel, child: const Text('Cancelar')),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
