import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/theme.dart';
import '../../providers/auth_provider.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  static const _quickActions = [
    ('Ajuda', Icons.help_outline),
    ('Carteira', Icons.account_balance_wallet_outlined),
    ('Segurança', Icons.shield_outlined),
    ('Mensagens', Icons.mail_outline),
  ];

  static const _menu = [
    ('Família', 'Gestão de contas de adolescentes e idosos', Icons.groups_outlined),
    ('Definições', null, Icons.settings_outlined),
    ('Informações legais', null, Icons.info_outline),
  ];

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user;
    final name = user?.fullName ?? 'Felipe Goulart';

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(name, style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          const Icon(Icons.star, size: 14),
                          const Text(' 4.93', style: TextStyle(fontWeight: FontWeight.w600)),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(color: AppTheme.gray100, borderRadius: BorderRadius.circular(12)),
                            child: const Row(
                              children: [
                                Icon(Icons.verified, size: 14, color: AppTheme.accent),
                                SizedBox(width: 4),
                                Text('Verificado', style: TextStyle(color: AppTheme.accent, fontSize: 12, fontWeight: FontWeight.w600)),
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
                  backgroundColor: AppTheme.gray100,
                  child: Text(name.substring(0, 1).toUpperCase(), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: AppTheme.gray100, borderRadius: BorderRadius.circular(12)),
              child: const Row(
                children: [
                  Icon(Icons.person_outline),
                  SizedBox(width: 10),
                  Expanded(child: Text('Pessoal', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16))),
                  Icon(Icons.expand_more),
                ],
              ),
            ),
            const SizedBox(height: 16),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
              childAspectRatio: 1.6,
              children: _quickActions
                  .map((a) => Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(color: AppTheme.gray100, borderRadius: BorderRadius.circular(12)),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(a.$2),
                            const Spacer(),
                            Text(a.$1, style: const TextStyle(fontWeight: FontWeight.w700)),
                          ],
                        ),
                      ))
                  .toList(),
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: AppTheme.gray100, borderRadius: BorderRadius.circular(12)),
              child: const Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Poupe na sua viagem', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                        Text('Descontos exclusivos para membros', style: TextStyle(color: AppTheme.gray400, fontSize: 13)),
                      ],
                    ),
                  ),
                  Icon(Icons.eco, color: AppTheme.success, size: 32),
                ],
              ),
            ),
            const SizedBox(height: 8),
            ..._menu.map((m) => ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(m.$3),
                  title: Text(m.$1, style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: m.$2 != null ? Text(m.$2!, style: const TextStyle(color: AppTheme.gray400, fontSize: 13)) : null,
                  trailing: const Icon(Icons.chevron_right, color: AppTheme.gray400),
                )),
            const SizedBox(height: 16),
            OutlinedButton(onPressed: auth.logout, child: const Text('Sair da conta')),
          ],
        ),
      ),
    );
  }
}
