import 'package:flutter/material.dart';

import '../../../theme/passenger_theme.dart';
import '../../../widgets/passenger/bc_subpage_scaffold.dart';

class PrivacyScreen extends StatelessWidget {
  const PrivacyScreen({super.key, this.embedded = false});

  final bool embedded;

  @override
  Widget build(BuildContext context) {
    final body = ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Privacidade e Dados', style: PassengerTheme.titleLarge.copyWith(fontSize: 22)),
        const SizedBox(height: 16),
        Text('Privacidade', style: PassengerTheme.titleMedium),
        const SizedBox(height: 8),
        BcMenuTile(
          title: 'Centro de Privacidade',
          subtitle: 'Controle a sua privacidade e saiba como a protegemos.',
          onTap: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Centro de Privacidade'))),
        ),
        const Divider(),
        BcMenuTile(
          title: 'Preferências de Comunicação',
          subtitle: 'Escolha que mensagens deseja receber.',
          onTap: () => _openCommPrefs(context),
        ),
        const SizedBox(height: 24),
        Text('Aplicações de terceiros com acesso à conta', style: PassengerTheme.titleMedium),
        const SizedBox(height: 8),
        Text.rich(
          TextSpan(
            text: 'Depois de permitir o acesso a aplicações de terceiros, irá vê-las aqui. ',
            style: PassengerTheme.caption,
            children: [
              WidgetSpan(
                child: GestureDetector(
                  onTap: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Saiba mais'))),
                  child: const Text('Saiba mais', style: TextStyle(decoration: TextDecoration.underline, fontWeight: FontWeight.w600)),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        BcMenuTile(
          title: 'Transferir os meus dados',
          subtitle: 'Solicitar uma cópia dos seus dados pessoais.',
          onTap: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Pedido de dados enviado'))),
        ),
        const Divider(),
        BcMenuTile(
          title: 'Eliminar conta',
          subtitle: 'Remover permanentemente a sua conta BC Taxi.',
          onTap: () => _confirmDelete(context),
        ),
      ],
    );

    if (embedded) return body;
    return BcSubpageScaffold(title: 'Privacidade e Dados', body: body);
  }

  void _openCommPrefs(BuildContext context) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) => Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Preferências de Comunicação', style: PassengerTheme.titleMedium),
              SwitchListTile(title: const Text('Promoções'), value: true, onChanged: (_) {}),
              SwitchListTile(title: const Text('Atualizações de viagem'), value: true, onChanged: (_) {}),
              SwitchListTile(title: const Text('Novidades BC Taxi'), value: false, onChanged: (_) {}),
            ],
          ),
        ),
      ),
    );
  }

  void _confirmDelete(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Eliminar conta?'),
        content: const Text('Esta ação não pode ser desfeita.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Eliminar', style: TextStyle(color: Colors.red))),
        ],
      ),
    );
  }
}
