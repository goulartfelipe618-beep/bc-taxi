import 'package:flutter/material.dart';

import '../../../constants/passenger_data.dart';
import '../../../theme/passenger_theme.dart';
import '../../../widgets/passenger/bc_subpage_scaffold.dart';

class HelpScreen extends StatelessWidget {
  const HelpScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BcSubpageScaffold(
      title: 'Ajuda',
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            decoration: InputDecoration(
              hintText: 'Como podemos ajudar?',
              prefixIcon: const Icon(Icons.search),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
            onSubmitted: (q) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Pesquisar: $q'))),
          ),
          const SizedBox(height: 24),
          ...helpTopics.map(
            (t) => BcMenuTile(
              title: t,
              onTap: () => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t))),
            ),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('A ligar para o suporte…'))),
            style: FilledButton.styleFrom(backgroundColor: BcColors.black, padding: const EdgeInsets.symmetric(vertical: 16)),
            child: const Text('Contactar suporte'),
          ),
        ],
      ),
    );
  }
}
