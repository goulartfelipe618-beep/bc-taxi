import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../services/api_client.dart';
import '../../services/auth_service.dart';
import '../../services/passenger_reputation_service.dart';
import '../../theme/passenger_theme.dart';

class PassengerReputationScreen extends StatefulWidget {
  const PassengerReputationScreen({super.key});

  @override
  State<PassengerReputationScreen> createState() => _PassengerReputationScreenState();
}

class _PassengerReputationScreenState extends State<PassengerReputationScreen> {
  PassengerReputationDashboard? _dashboard;
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
      final dashboard = await PassengerReputationService(ApiClient(token)).fetchDashboard();
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

  Future<void> _dismissInsight(PassengerReputationInsight insight) async {
    final token = context.read<AuthService>().token;
    if (token == null) return;
    try {
      await PassengerReputationService(ApiClient(token)).dismissInsight(insight.code);
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Reputação')),
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

  Widget _buildContent(PassengerReputationDashboard dashboard) {
    final profile = dashboard.profile;
    final scoreLabel = profile.displayScore.toStringAsFixed(2).replaceAll('.', ',');
    final kpis = dashboard.kpis;
    final progress = dashboard.tierProgress;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.star, color: Colors.amber, size: 28),
                    const SizedBox(width: 8),
                    Text(scoreLabel, style: PassengerTheme.titleLarge),
                    const Spacer(),
                    Chip(label: Text(profile.tier)),
                  ],
                ),
                if (profile.prepayRequired)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text('Pré-pagamento ativo', style: TextStyle(color: Colors.orange.shade800)),
                  ),
                if (progress != null && progress.nextTier != null) ...[
                  const SizedBox(height: 16),
                  Text('Próximo tier: ${progress.nextTier}'),
                  const SizedBox(height: 8),
                  LinearProgressIndicator(value: progress.progressPct / 100),
                  if (progress.pointsToNext != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text('Faltam ${progress.pointsToNext!.toStringAsFixed(2)} pontos'),
                    ),
                ],
              ],
            ),
          ),
        ),
        if (dashboard.benefits != null) ...[
          const SizedBox(height: 16),
          Card(
            child: ListTile(
              title: const Text('Benefícios do tier'),
              subtitle: Text(
                'Prioridade ${dashboard.benefits!['dispatchPriorityPct'] ?? 0}% · '
                'Desconto carteira ${dashboard.benefits!['maxWalletDiscountPct'] ?? 0}%',
              ),
            ),
          ),
        ],
        if (kpis != null) ...[
          const SizedBox(height: 16),
          const Text('Indicadores', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(child: _KpiTile(label: 'Viagens', value: '${kpis.completedRides}')),
              Expanded(child: _KpiTile(label: 'Pagamentos', value: kpis.paymentSuccessLabel)),
              Expanded(child: _KpiTile(label: 'Cancel. tardio', value: kpis.lateCancelLabel)),
            ],
          ),
        ],
        const SizedBox(height: 20),
        const Text('Comportamento', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        _MetricBar(label: 'Presença no embarque', value: dashboard.operationalBreakdown.boardingPresence),
        _MetricBar(label: 'Pagamentos', value: dashboard.operationalBreakdown.paymentSuccess),
        _MetricBar(label: 'Cancelamentos tardios', value: dashboard.operationalBreakdown.lateCancelIndex),
        _MetricBar(label: 'Comportamento', value: dashboard.operationalBreakdown.behaviorIndex),
        if (dashboard.insights.isNotEmpty) ...[
          const SizedBox(height: 20),
          const Text('Insights', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          ...dashboard.insights.map(
            (insight) => _InsightCard(insight: insight, onDismiss: () => _dismissInsight(insight)),
          ),
        ],
        if (dashboard.badges.isNotEmpty) ...[
          const SizedBox(height: 20),
          const Text('Badges', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: dashboard.badges
                .map((b) => Chip(label: Text(b['label'] as String? ?? b['code'] as String)))
                .toList(),
          ),
        ],
      ],
    );
  }
}

class _KpiTile extends StatelessWidget {
  const _KpiTile({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            Text(value, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            const SizedBox(height: 4),
            Text(label, style: TextStyle(fontSize: 12, color: Colors.grey[600])),
          ],
        ),
      ),
    );
  }
}

class _MetricBar extends StatelessWidget {
  const _MetricBar({required this.label, required this.value});

  final String label;
  final double value;

  @override
  Widget build(BuildContext context) {
    final normalized = (value / 5).clamp(0.0, 1.0);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [Text(label), Text(value.toStringAsFixed(1))],
          ),
          const SizedBox(height: 4),
          LinearProgressIndicator(value: normalized),
        ],
      ),
    );
  }
}

class _InsightCard extends StatelessWidget {
  const _InsightCard({required this.insight, required this.onDismiss});

  final PassengerReputationInsight insight;
  final VoidCallback onDismiss;

  Color get _color {
    switch (insight.severity) {
      case 'warning':
        return Colors.orange.shade50;
      case 'success':
        return Colors.green.shade50;
      default:
        return Colors.blue.shade50;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      color: _color,
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        title: Text(insight.title, style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text(insight.body),
        trailing: IconButton(icon: const Icon(Icons.close, size: 18), onPressed: onDismiss),
      ),
    );
  }
}
