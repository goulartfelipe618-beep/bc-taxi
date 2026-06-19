import 'package:flutter/material.dart';

import '../../../constants/passenger_data.dart';
import '../../../theme/passenger_theme.dart';
import '../../../widgets/passenger/bc_subpage_scaffold.dart';

class SessionActivityScreen extends StatelessWidget {
  const SessionActivityScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BcSubpageScaffold(
      title: 'Atividade de início de sessão',
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Tem ou teve sessão iniciada nestes dispositivos nos últimos 30 dias.',
            style: PassengerTheme.caption,
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(border: Border.all(color: BcColors.border), borderRadius: BorderRadius.circular(12)),
            child: Row(
              children: [
                const Icon(Icons.smartphone),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(loginSessions.first.device, style: const TextStyle(fontWeight: FontWeight.w700)),
                      Text('O seu início de sessão atual', style: TextStyle(color: BcColors.blue, fontWeight: FontWeight.w600, fontSize: 13)),
                      Text('${loginSessions.first.location} · ${loginSessions.first.platform}', style: PassengerTheme.caption),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          ...loginSessions.skip(1).map(
                (s) => ListTile(
                  leading: const Icon(Icons.devices),
                  title: Text(s.device),
                  subtitle: Text('${s.location} · ${s.platform}'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => _sessionDetail(context, s.device),
                ),
              ),
          const Divider(height: 32),
          BcMenuTile(
            title: 'Encerrar a sessão em todos os dispositivos',
            subtitle: 'Todos, exceto o seu início de sessão atual',
            leading: const Icon(Icons.logout),
            onTap: () => _logoutAll(context),
          ),
        ],
      ),
    );
  }

  void _sessionDetail(BuildContext context, String device) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(device),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Fechar')),
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Terminar sessão', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }

  void _logoutAll(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Terminar outras sessões?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Confirmar')),
        ],
      ),
    );
  }
}
