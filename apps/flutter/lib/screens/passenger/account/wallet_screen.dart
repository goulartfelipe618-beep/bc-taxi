import 'package:flutter/material.dart';

import '../../../constants/passenger_data.dart';
import '../../../theme/passenger_theme.dart';
import '../../../widgets/passenger/bc_subpage_scaffold.dart';
import '../passenger_routes.dart';

class WalletScreen extends StatelessWidget {
  const WalletScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BcSubpageScaffold(
      title: 'Carteira',
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(color: BcColors.grayLight, borderRadius: BorderRadius.circular(12)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Saldo BC Taxi', style: PassengerTheme.caption),
                const SizedBox(height: 4),
                Text('R\$ ${mockUser.walletBalance.toStringAsFixed(2)}', style: PassengerTheme.titleLarge),
                const SizedBox(height: 12),
                OutlinedButton(onPressed: () {}, child: const Text('Adicionar fundos')),
              ],
            ),
          ),
          const SizedBox(height: 24),
          Text('Métodos de pagamento', style: PassengerTheme.titleMedium),
          const SizedBox(height: 12),
          ...paymentMethods.map(
            (m) => ListTile(
              leading: Icon(m.icon),
              title: Text(m.label),
              subtitle: m.subtitle != null ? Text(m.subtitle!) : null,
              trailing: m.isDefault ? const Text('Predefinido', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 12)) : null,
              onTap: () => PassengerRoutes.openPaymentMethods(context),
            ),
          ),
          const Divider(height: 32),
          Text('Histórico', style: PassengerTheme.titleMedium),
          ...walletTransactions.map(
            (t) => ListTile(
              title: Text(t.title),
              subtitle: Text(t.dateLabel),
              trailing: Text(t.amountLabel, style: const TextStyle(fontWeight: FontWeight.w700)),
            ),
          ),
        ],
      ),
    );
  }
}
