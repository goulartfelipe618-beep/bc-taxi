import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../constants/passenger_data.dart';
import '../../../models/trip_draft.dart';
import '../../../services/api_client.dart';
import '../../../services/auth_service.dart';
import '../../../services/passenger_account_service.dart';
import '../../../services/payment_service.dart';
import '../../../theme/passenger_theme.dart';
import '../../../widgets/passenger/bc_subpage_scaffold.dart';
import '../passenger_routes.dart';

class WalletScreen extends StatefulWidget {
  const WalletScreen({super.key});

  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  PassengerWallet? _wallet;
  List<PaymentMethod> _methods = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final token = context.read<AuthService>().token;
    if (token == null) {
      _useFallback();
      return;
    }
    try {
      final service = PassengerAccountService(ApiClient(token));
      final paymentService = PaymentService(ApiClient(token));
      final results = await Future.wait([service.fetchWallet(), paymentService.fetchMethods()]);
      if (!mounted) return;
      setState(() {
        _wallet = results[0] as PassengerWallet;
        _methods = results[1] as List<PaymentMethod>;
        _loading = false;
      });
    } catch (_) {
      _useFallback();
    }
  }

  void _useFallback() {
    if (!mounted) return;
    setState(() {
      _wallet = PassengerWallet(
        balanceCentavos: (mockUser.walletBalance * 100).round(),
        balanceLabel: 'R\$ ${mockUser.walletBalance.toStringAsFixed(2)}',
        transactions: walletTransactions
            .map(
              (t) => PassengerWalletTransaction(
                id: t.title,
                title: t.title,
                amountCentavos: t.amountLabel.startsWith('+') ? 1000 : -1000,
                createdAt: DateTime.now().toIso8601String(),
              ),
            )
            .toList(),
      );
      _methods = paymentMethods
          .map(
            (m) => PaymentMethod(
              id: paymentMethodIdForLabel(m.label),
              type: m.id,
              label: m.label,
              isDefault: m.isDefault,
            ),
          )
          .toList();
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return BcSubpageScaffold(
      title: 'Carteira',
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
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
                      Text(_wallet?.balanceLabel ?? 'R\$ 0,00', style: PassengerTheme.titleLarge),
                      const SizedBox(height: 12),
                      OutlinedButton(onPressed: () {}, child: const Text('Adicionar fundos')),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                Text('Métodos de pagamento', style: PassengerTheme.titleMedium),
                const SizedBox(height: 12),
                ..._methods.map(
                  (m) => ListTile(
                    leading: Icon(_iconFor(m.type)),
                    title: Text(m.label),
                    trailing: m.isDefault ? const Text('Predefinido', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 12)) : null,
                    onTap: () => PassengerRoutes.openPaymentMethods(context),
                  ),
                ),
                const Divider(height: 32),
                Text('Histórico', style: PassengerTheme.titleMedium),
                ...(_wallet?.transactions ?? []).map(
                  (t) => ListTile(
                    title: Text(t.title),
                    subtitle: Text(t.createdAt.substring(0, 10)),
                    trailing: Text(t.amountLabel, style: const TextStyle(fontWeight: FontWeight.w700)),
                  ),
                ),
              ],
            ),
    );
  }

  IconData _iconFor(String type) {
    switch (type) {
      case 'cash':
        return Icons.payments_outlined;
      case 'card':
      case 'debit':
        return Icons.credit_card;
      default:
        return Icons.pix;
    }
  }
}
