import 'package:flutter/material.dart';

import '../../../constants/passenger_data.dart';
import '../../../theme/passenger_theme.dart';
import '../../../widgets/passenger/bc_subpage_scaffold.dart';
import 'session_activity_screen.dart';

class SecurityScreen extends StatelessWidget {
  const SecurityScreen({super.key, this.embedded = false});

  final bool embedded;

  @override
  Widget build(BuildContext context) {
    final body = ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Segurança', style: PassengerTheme.titleLarge.copyWith(fontSize: 22)),
        const SizedBox(height: 16),
        Text('Iniciar sessão na BC Taxi', style: PassengerTheme.titleMedium),
        const SizedBox(height: 8),
        BcMenuTile(
          title: 'Palavra-passe',
          subtitle: 'Última alteração ${mockUser.passwordChangedLabel}',
          onTap: () => _changePassword(context),
        ),
        const Divider(),
        BcMenuTile(
          title: 'Verificação em 2 passos',
          subtitle: 'Adicione mais segurança à sua conta.',
          onTap: () => _toggle2FA(context),
        ),
        const Divider(),
        BcMenuTile(
          title: 'Telefone de recuperação',
          subtitle: 'Número alternativo para aceder à conta.',
          onTap: () => _editRecoveryPhone(context),
        ),
        const SizedBox(height: 24),
        Text('Aplicações sociais associadas', style: PassengerTheme.titleMedium),
        const SizedBox(height: 8),
        Text('Faça a gestão das aplicações que utilizou para iniciar sessão.', style: PassengerTheme.caption),
        const SizedBox(height: 12),
        Row(
          children: [
            const Icon(Icons.g_mobiledata, size: 28),
            const SizedBox(width: 12),
            const Expanded(child: Text('Google', style: TextStyle(fontWeight: FontWeight.w600))),
            OutlinedButton(onPressed: () => _linkGoogle(context), child: const Text('Associar')),
          ],
        ),
        const SizedBox(height: 24),
        BcMenuTile(
          title: 'Atividade de início de sessão',
          subtitle: 'Dispositivos com sessão nos últimos 30 dias.',
          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SessionActivityScreen())),
        ),
      ],
    );

    if (embedded) return body;
    return BcSubpageScaffold(title: 'Segurança', body: body);
  }

  void _changePassword(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Alterar palavra-passe'),
        content: const Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(obscureText: true, decoration: InputDecoration(labelText: 'Atual')),
            TextField(obscureText: true, decoration: InputDecoration(labelText: 'Nova')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Guardar')),
        ],
      ),
    );
  }

  void _toggle2FA(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Verificação em 2 passos'),
        content: const Text('Receberá um código por SMS ao iniciar sessão num dispositivo novo.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Ativar')),
        ],
      ),
    );
  }

  void _editRecoveryPhone(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Adicionar telefone de recuperação')));
  }

  void _linkGoogle(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('A associar conta Google…')));
  }
}
