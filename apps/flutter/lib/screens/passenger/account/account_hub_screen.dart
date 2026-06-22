import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../constants/passenger_data.dart';
import '../../../services/api_client.dart';
import '../../../services/auth_service.dart';
import '../../../services/passenger_account_service.dart';
import '../../../theme/passenger_theme.dart';
import '../passenger_routes.dart';
import 'personal_info_screen.dart';
import 'privacy_screen.dart';
import 'security_screen.dart';

class AccountHubScreen extends StatefulWidget {
  const AccountHubScreen({super.key, this.initialTab = 0});

  final int initialTab;

  @override
  State<AccountHubScreen> createState() => _AccountHubScreenState();
}

class _AccountHubScreenState extends State<AccountHubScreen> {
  late int _tab;
  PassengerAccountProfile? _profile;
  bool _loadingProfile = true;

  @override
  void initState() {
    super.initState();
    _tab = widget.initialTab;
    _loadProfile();
  }

  Future<void> _loadProfile() async {
    final token = context.read<AuthService>().token;
    if (token == null) {
      setState(() => _loadingProfile = false);
      return;
    }
    try {
      final dashboard = await PassengerAccountService(ApiClient(token)).fetchDashboard();
      if (!mounted) return;
      setState(() {
        _profile = dashboard.profile;
        _loadingProfile = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingProfile = false);
    }
  }

  static const _tabs = ['Casa', 'Informações pessoais', 'Segurança', 'Privacidade e Dados'];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        foregroundColor: BcColors.black,
        elevation: 0,
        leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => Navigator.pop(context)),
        title: const Text('Conta BC Taxi', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              children: List.generate(_tabs.length, (i) {
                final active = i == _tab;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(_tabs[i]),
                    selected: active,
                    onSelected: (_) => setState(() => _tab = i),
                    selectedColor: BcColors.grayLight,
                    labelStyle: TextStyle(fontWeight: active ? FontWeight.w700 : FontWeight.w500, color: BcColors.black),
                    side: BorderSide(color: active ? BcColors.black : BcColors.border),
                  ),
                );
              }),
            ),
          ),
          Expanded(child: _buildTab()),
        ],
      ),
    );
  }

  Widget _buildTab() {
    switch (_tab) {
      case 1:
        return const PersonalInfoScreen(embedded: true);
      case 2:
        return const SecurityScreen(embedded: true);
      case 3:
        return const PrivacyScreen(embedded: true);
      default:
        final name = _profile?.fullName ?? mockUser.name;
        final email = _profile?.email ?? mockUser.email;
        final verified = _profile?.identityStatus == 'verified';
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (_loadingProfile) const LinearProgressIndicator(minHeight: 2),
            Row(
              children: [
                const CircleAvatar(radius: 36, child: Icon(Icons.person, size: 36)),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(name, style: PassengerTheme.titleMedium),
                      Text(email, style: PassengerTheme.caption),
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          Icon(Icons.verified, color: verified ? BcColors.blue : BcColors.gray, size: 16),
                          const SizedBox(width: 4),
                          Text(
                            verified ? 'Verificado' : 'Verificação pendente',
                            style: TextStyle(color: verified ? BcColors.blue : BcColors.gray, fontWeight: FontWeight.w600, fontSize: 13),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
            Row(
              children: [
                _quickTile(Icons.person_outline, 'Informações pessoais', () => setState(() => _tab = 1)),
                const SizedBox(width: 10),
                _quickTile(Icons.shield_outlined, 'Segurança', () => setState(() => _tab = 2)),
                const SizedBox(width: 10),
                _quickTile(Icons.lock_outline, 'Privacidade', () => setState(() => _tab = 3)),
              ],
            ),
            const SizedBox(height: 24),
            Text('Sugestões', style: PassengerTheme.titleMedium),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(border: Border.all(color: BcColors.border), borderRadius: BorderRadius.circular(12)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.badge_outlined, size: 32, color: BcColors.blue),
                  const SizedBox(height: 8),
                  const Text('Conclua a verificação da sua conta', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  const SizedBox(height: 6),
                  Text('Verifique a sua identidade para maior segurança nas corridas.', style: PassengerTheme.caption),
                  const SizedBox(height: 12),
                  OutlinedButton(
                    onPressed: () => PassengerRoutes.openVerification(context),
                    child: const Text('Começar a verificação'),
                  ),
                ],
              ),
            ),
          ],
        );
    }
  }

  Widget _quickTile(IconData icon, String label, VoidCallback onTap) {
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 16),
          decoration: BoxDecoration(color: BcColors.grayLight, borderRadius: BorderRadius.circular(12)),
          child: Column(
            children: [
              Icon(icon, size: 24),
              const SizedBox(height: 8),
              Text(label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
            ],
          ),
        ),
      ),
    );
  }
}
