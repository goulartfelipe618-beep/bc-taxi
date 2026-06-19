import 'package:flutter/material.dart';

import '../../../theme/passenger_theme.dart';

class ActivityFilterSheet extends StatefulWidget {
  const ActivityFilterSheet({super.key});

  @override
  State<ActivityFilterSheet> createState() => _ActivityFilterSheetState();
}

class _ActivityFilterSheetState extends State<ActivityFilterSheet> {
  String _period = 'Todos';
  String _status = 'Todos';

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Filtrar atividade', style: PassengerTheme.titleMedium),
          const SizedBox(height: 16),
          Text('Período', style: PassengerTheme.caption),
          Wrap(
            spacing: 8,
            children: ['Todos', '7 dias', '30 dias', '90 dias']
                .map((p) => ChoiceChip(label: Text(p), selected: _period == p, onSelected: (_) => setState(() => _period = p)))
                .toList(),
          ),
          const SizedBox(height: 16),
          Text('Estado', style: PassengerTheme.caption),
          Wrap(
            spacing: 8,
            children: ['Todos', 'Concluídas', 'Canceladas']
                .map((s) => ChoiceChip(label: Text(s), selected: _status == s, onSelected: (_) => setState(() => _status = s)))
                .toList(),
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: () {
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Filtro: $_period · $_status')));
            },
            style: FilledButton.styleFrom(backgroundColor: BcColors.black),
            child: const Text('Aplicar filtro'),
          ),
        ],
      ),
    );
  }
}
