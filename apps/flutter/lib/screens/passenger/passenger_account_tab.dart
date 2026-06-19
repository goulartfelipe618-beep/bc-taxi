import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../constants/passenger_data.dart';
import '../../services/auth_service.dart';
import '../../theme/passenger_theme.dart';
import '../login_screen.dart';
import 'passenger_routes.dart';
import 'widgets/passenger_sheets.dart';

class PassengerAccountTab extends StatelessWidget {
  const PassengerAccountTab({super.key});

  Future<void> _logout(BuildContext context) async {
    await context.read<AuthService>().logout();
    if (!context.mounted) return;
    Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const LoginScreen()), (_) => false);
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthService>().user!;
    final name = user.fullName.toLowerCase();

    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          InkWell(
            onTap: () => PassengerRoutes.openAccountHub(context),
            borderRadius: BorderRadius.circular(12),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(name, style: PassengerTheme.titleLarge.copyWith(fontSize: 26)),
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          const Icon(Icons.star, size: 16),
                          Text(' ${mockUser.rating.toStringAsFixed(2).replaceAll('.', ',')}', style: const TextStyle(fontWeight: FontWeight.w600)),
                          const SizedBox(width: 10),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(color: BcColors.grayLight, borderRadius: BorderRadius.circular(6)),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.verified, size: 14, color: BcColors.blue),
                                const SizedBox(width: 4),
                                const Text('Verificado', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                CircleAvatar(
                  radius: 32,
                  backgroundColor: BcColors.grayLight,
                  child: Text(name.isNotEmpty ? name[0].toUpperCase() : '?', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          const _ProfileSelector(),
          const SizedBox(height: 20),
          const _QuickGrid(),
          const SizedBox(height: 20),
          _PromoCard(
            title: 'Poupe na sua viagem',
            icon: Icons.savings_outlined,
            onTap: () => PassengerRoutes.openPlanTrip(context),
          ),
          const SizedBox(height: 10),
          _PromoCard(
            title: 'Experimente Conforto',
            icon: Icons.airline_seat_recline_normal_outlined,
            onTap: () => PassengerRoutes.openPlanTrip(context, preselectedCategoryId: 'comfort'),
          ),
          const SizedBox(height: 20),
          _MenuTile(icon: Icons.manage_accounts_outlined, title: 'Gerir conta BC Taxi', onTap: () => PassengerRoutes.openAccountHub(context)),
          _MenuTile(icon: Icons.settings_outlined, title: 'Definições', onTap: () => PassengerRoutes.openSettings(context)),
          _MenuTile(icon: Icons.payment_outlined, title: 'Pagamentos', subtitle: 'PIX · Pessoal', onTap: () => PassengerRoutes.openPaymentMethods(context)),
          _MenuTile(icon: Icons.shield_outlined, title: 'Segurança', onTap: () => PassengerRoutes.openSecurity(context)),
          _MenuTile(icon: Icons.help_outline, title: 'Ajuda', onTap: () => PassengerRoutes.openHelp(context)),
          _MenuTile(icon: Icons.description_outlined, title: 'Informações legais', onTap: () => PassengerRoutes.openLegal(context)),
          const SizedBox(height: 12),
          ListTile(
            leading: const Icon(Icons.logout, color: BcColors.gray),
            title: const Text('Sair da conta'),
            onTap: () => _logout(context),
          ),
          const SizedBox(height: 8),
          Text(user.email, style: PassengerTheme.caption, textAlign: TextAlign.center),
        ],
      ),
    );
  }
}

class _ProfileSelector extends StatefulWidget {
  const _ProfileSelector();

  @override
  State<_ProfileSelector> createState() => _ProfileSelectorState();
}

class _ProfileSelectorState extends State<_ProfileSelector> {
  String _profile = 'Pessoal';

  @override
  Widget build(BuildContext context) {
    return Material(
      color: BcColors.grayLight,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: () async {
          final result = await showChangeProfileSheet(context, _profile);
          if (result != null) setState(() => _profile = result);
        },
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: [
              Icon(_profile == 'Empresarial' ? Icons.work_outline : Icons.person_outline),
              const SizedBox(width: 10),
              Expanded(child: Text(_profile, style: const TextStyle(fontWeight: FontWeight.w600))),
              const Icon(Icons.expand_more, color: BcColors.gray),
            ],
          ),
        ),
      ),
    );
  }
}

class _QuickGrid extends StatelessWidget {
  const _QuickGrid();

  @override
  Widget build(BuildContext context) {
    final items = [
      (Icons.help_outline, 'Ajuda', () => PassengerRoutes.openHelp(context)),
      (Icons.account_balance_wallet_outlined, 'Carteira', () => PassengerRoutes.openWallet(context)),
      (Icons.shield_outlined, 'Segurança', () => PassengerRoutes.openSecurity(context)),
      (Icons.mail_outline, 'Mensagens', () => PassengerRoutes.openMessages(context)),
    ];

    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: 2.4,
      children: items.map((e) {
        return Material(
          color: BcColors.grayLight,
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            onTap: e.$3,
            borderRadius: BorderRadius.circular(12),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              child: Row(
                children: [
                  Icon(e.$1, size: 22),
                  const SizedBox(width: 10),
                  Expanded(child: Text(e.$2, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14))),
                ],
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}

class _PromoCard extends StatelessWidget {
  const _PromoCard({required this.title, required this.icon, required this.onTap});

  final String title;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: BcColors.grayLight,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Icon(icon, size: 28),
              const SizedBox(width: 12),
              Expanded(child: Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
              const Icon(Icons.chevron_right, color: BcColors.gray),
            ],
          ),
        ),
      ),
    );
  }
}

class _MenuTile extends StatelessWidget {
  const _MenuTile({required this.icon, required this.title, this.subtitle, required this.onTap});

  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(icon, size: 24),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 16)),
      subtitle: subtitle != null ? Text(subtitle!, style: PassengerTheme.caption) : null,
      trailing: const Icon(Icons.chevron_right, color: BcColors.gray),
      onTap: onTap,
    );
  }
}
