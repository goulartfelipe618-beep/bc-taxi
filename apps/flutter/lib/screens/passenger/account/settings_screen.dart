import 'package:flutter/material.dart';

import '../../../constants/passenger_data.dart';
import '../../../theme/passenger_theme.dart';
import '../../../widgets/passenger/bc_subpage_scaffold.dart';
import '../passenger_routes.dart';
import 'personal_info_screen.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BcSubpageScaffold(
      title: 'Definições',
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          ...accountMenuItems.map(
            (item) => BcMenuTile(
              title: item.title,
              subtitle: item.subtitle,
              leading: Icon(item.icon, size: 22),
              onTap: () => _handleMenu(context, item.id),
            ),
          ),
          const SizedBox(height: 24),
          Text('v1.0.0', style: PassengerTheme.caption, textAlign: TextAlign.center),
        ],
      ),
    );
  }

  void _handleMenu(BuildContext context, String id) {
    switch (id) {
      case 'personal':
        Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PersonalInfoScreen()));
      case 'security':
        PassengerRoutes.openSecurity(context);
      case 'privacy':
        PassengerRoutes.openPrivacy(context);
      case 'wallet':
        PassengerRoutes.openWallet(context);
      case 'legal':
        PassengerRoutes.openLegal(context);
      case 'driver':
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Abrir app Motorista BC Taxi')));
      case 'verification':
        PassengerRoutes.openVerification(context);
      default:
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Em breve: $id')));
    }
  }
}
