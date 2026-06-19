import 'package:flutter/material.dart';

import '../../../constants/passenger_data.dart';
import '../../../theme/passenger_theme.dart';
import '../../../widgets/passenger/bc_subpage_scaffold.dart';

class MessagesScreen extends StatelessWidget {
  const MessagesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BcSubpageScaffold(
      title: 'Mensagens',
      body: ListView(
        children: mockMessages.map((m) {
          return ListTile(
            leading: CircleAvatar(child: Icon(m.icon)),
            title: Text(m.title, style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text(m.preview, maxLines: 1, overflow: TextOverflow.ellipsis),
            trailing: Text(m.timeLabel, style: PassengerTheme.caption),
            onTap: () => showDialog(
              context: context,
              builder: (ctx) => AlertDialog(title: Text(m.title), content: Text(m.body)),
            ),
          );
        }).toList(),
      ),
    );
  }
}
