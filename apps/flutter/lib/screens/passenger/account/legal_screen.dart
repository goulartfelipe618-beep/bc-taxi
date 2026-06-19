import 'package:flutter/material.dart';

import '../../../constants/passenger_data.dart';
import '../../../widgets/passenger/bc_subpage_scaffold.dart';

class LegalScreen extends StatelessWidget {
  const LegalScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BcSubpageScaffold(
      title: 'Informações legais',
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: legalDocuments
            .map(
              (doc) => BcMenuTile(
                title: doc,
                onTap: () => showDialog(
                  context: context,
                  builder: (ctx) => AlertDialog(title: Text(doc), content: Text('Conteúdo de $doc (demonstração).')),
                ),
              ),
            )
            .toList(),
      ),
    );
  }
}
