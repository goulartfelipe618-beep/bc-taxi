import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../services/auth_service.dart';
import '../../theme/passenger_theme.dart';
import '../login_screen.dart';

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
          Row(
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
                        const Text(' 4,93', style: TextStyle(fontWeight: FontWeight.w600)),
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
          const SizedBox(height: 20),
          _QuickGrid(),
          const SizedBox(height: 20),
          _MenuTile(icon: Icons.settings_outlined, title: 'Definições'),
          _MenuTile(icon: Icons.payment_outlined, title: 'Pagamentos', subtitle: 'PIX · Pessoal'),
          _MenuTile(icon: Icons.shield_outlined, title: 'Segurança'),
          _MenuTile(icon: Icons.help_outline, title: 'Ajuda'),
          _MenuTile(icon: Icons.description_outlined, title: 'Informações legais'),
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

class _QuickGrid extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    const items = [
      (Icons.help_outline, 'Ajuda'),
      (Icons.account_balance_wallet_outlined, 'Carteira'),
      (Icons.shield_outlined, 'Segurança'),
      (Icons.mail_outline, 'Mensagens'),
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
            onTap: () {},
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

class _MenuTile extends StatelessWidget {
  const _MenuTile({required this.icon, required this.title, this.subtitle});

  final IconData icon;
  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(icon, size: 24),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 16)),
      subtitle: subtitle != null ? Text(subtitle!, style: PassengerTheme.caption) : null,
      trailing: const Icon(Icons.chevron_right, color: BcColors.gray),
      onTap: () {},
    );
  }
}
