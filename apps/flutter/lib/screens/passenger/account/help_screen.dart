import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../services/api_client.dart';
import '../../../services/auth_service.dart';
import '../../../services/safety_help_service.dart';
import '../../../theme/passenger_theme.dart';
import '../../../widgets/passenger/bc_subpage_scaffold.dart';

class HelpScreen extends StatefulWidget {
  const HelpScreen({super.key});

  @override
  State<HelpScreen> createState() => _HelpScreenState();
}

class _HelpScreenState extends State<HelpScreen> {
  SafetyHelpDashboard? _dashboard;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final token = context.read<AuthService>().token;
    if (token == null) {
      setState(() {
        _loading = false;
        _error = 'Sessão expirada';
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final dashboard = await SafetyHelpService(ApiClient(token)).fetchDashboard();
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

  Future<void> _search(String query) async {
    if (query.trim().isEmpty) return;
    final token = context.read<AuthService>().token;
    if (token == null) return;
    try {
      await SafetyHelpService(ApiClient(token)).recordInquiry(topicCode: 'search', searchQuery: query.trim());
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Pesquisa registada: $query')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Future<void> _openTopic(SafetyHelpTopic topic) async {
    final token = context.read<AuthService>().token;
    if (token == null) return;
    try {
      await SafetyHelpService(ApiClient(token)).recordInquiry(topicCode: topic.code);
      if (!mounted) return;
      showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(topic.title),
          content: Text(topic.summary),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Fechar')),
          ],
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Future<void> _shareRide() async {
    final token = context.read<AuthService>().token;
    if (token == null) return;
    try {
      final url = await SafetyHelpService(ApiClient(token)).shareRide();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Link gerado: $url')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const BcSubpageScaffold(
        title: 'Ajuda',
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (_error != null || _dashboard == null) {
      return BcSubpageScaffold(
        title: 'Ajuda',
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_error ?? 'Erro ao carregar', textAlign: TextAlign.center),
              const SizedBox(height: 12),
              FilledButton(onPressed: _load, child: const Text('Tentar novamente')),
            ],
          ),
        ),
      );
    }

    final dashboard = _dashboard!;
    return BcSubpageScaffold(
      title: 'Ajuda',
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            color: Colors.red.shade50,
            child: ListTile(
              leading: const Icon(Icons.emergency, color: Colors.red),
              title: Text('Emergência — ${dashboard.emergencyHotline}'),
              subtitle: const Text('Ligue imediatamente em caso de perigo.'),
              onTap: () => ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('A ligar ${dashboard.emergencyHotline}…')),
              ),
            ),
          ),
          const SizedBox(height: 12),
          ...dashboard.safetyTools.where((t) => t['enabled'] == true).map(
            (tool) => Card(
              child: ListTile(
                leading: const Icon(Icons.shield_outlined),
                title: Text(tool['label'] as String? ?? ''),
                subtitle: Text(tool['description'] as String? ?? ''),
                onTap: tool['code'] == 'share_ride' ? _shareRide : null,
              ),
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            decoration: InputDecoration(
              hintText: 'Como podemos ajudar?',
              prefixIcon: const Icon(Icons.search),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
            onSubmitted: _search,
          ),
          const SizedBox(height: 24),
          Text('Tópicos frequentes', style: PassengerTheme.titleMedium),
          const SizedBox(height: 8),
          ...dashboard.helpTopics.map(
            (topic) => BcMenuTile(
              title: topic.title,
              subtitle: topic.summary,
              onTap: () => _openTopic(topic),
            ),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('A ligar para ${dashboard.supportPhone}…')),
            ),
            style: FilledButton.styleFrom(backgroundColor: BcColors.black, padding: const EdgeInsets.symmetric(vertical: 16)),
            child: const Text('Contactar suporte'),
          ),
        ],
      ),
    );
  }
}
