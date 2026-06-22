import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../constants/passenger_data.dart';
import '../../../services/api_client.dart';
import '../../../services/auth_service.dart';
import '../../../services/passenger_account_service.dart';
import '../../../theme/passenger_theme.dart';
import '../../../widgets/passenger/bc_subpage_scaffold.dart';
import 'session_activity_screen.dart';

class SecurityScreen extends StatefulWidget {
  const SecurityScreen({super.key, this.embedded = false});

  final bool embedded;

  @override
  State<SecurityScreen> createState() => _SecurityScreenState();
}

class _SecurityScreenState extends State<SecurityScreen> {
  PassengerSecuritySummary? _security;
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
      final security = await PassengerAccountService(ApiClient(token)).fetchSecurity();
      if (!mounted) return;
      setState(() {
        _security = security;
        _loading = false;
      });
    } catch (_) {
      _useFallback();
    }
  }

  void _useFallback() {
    if (!mounted) return;
    setState(() {
      _security = PassengerSecuritySummary(
        passwordChangedLabel: mockUser.passwordChangedLabel,
        twoFactorEnabled: false,
      );
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      final loading = const Center(child: CircularProgressIndicator());
      if (widget.embedded) return loading;
      return BcSubpageScaffold(title: 'Segurança', body: loading);
    }

    final security = _security!;
    final body = ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Segurança', style: PassengerTheme.titleLarge.copyWith(fontSize: 22)),
        const SizedBox(height: 16),
        Text('Iniciar sessão na BC Taxi', style: PassengerTheme.titleMedium),
        const SizedBox(height: 8),
        BcMenuTile(
          title: 'Palavra-passe',
          subtitle: 'Última alteração ${security.passwordChangedLabel}',
          onTap: () => _changePassword(context),
        ),
        const Divider(),
        BcMenuTile(
          title: 'Verificação em 2 passos',
          subtitle: security.twoFactorEnabled ? 'Ativada' : 'Adicione mais segurança à sua conta.',
          onTap: () => _toggle2FA(context),
        ),
        const Divider(),
        BcMenuTile(
          title: 'Telefone de recuperação',
          subtitle: security.recoveryPhone ?? 'Número alternativo para aceder à conta.',
          onTap: () => _editRecoveryPhone(context),
        ),
        const SizedBox(height: 24),
        Text('Aplicações sociais associadas', style: PassengerTheme.titleMedium),
        const SizedBox(height: 8),
        Text('Faça a gestão das aplicações que utilizou para iniciar sessão.', style: PassengerTheme.caption),
        const SizedBox(height: 12),
        Row(
          children: [
            const Icon(Icons.g_mobiledata, size: 28),
            const SizedBox(width: 12),
            const Expanded(child: Text('Google', style: TextStyle(fontWeight: FontWeight.w600))),
            OutlinedButton(onPressed: () => _linkGoogle(context), child: const Text('Associar')),
          ],
        ),
        const SizedBox(height: 24),
        BcMenuTile(
          title: 'Atividade de início de sessão',
          subtitle: 'Dispositivos com sessão nos últimos 30 dias.',
          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SessionActivityScreen())),
        ),
      ],
    );

    if (widget.embedded) return body;
    return BcSubpageScaffold(title: 'Segurança', body: body);
  }

  Future<void> _changePassword(BuildContext context) async {
    final currentCtrl = TextEditingController();
    final newCtrl = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Alterar palavra-passe'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: currentCtrl, obscureText: true, decoration: const InputDecoration(labelText: 'Atual')),
            TextField(controller: newCtrl, obscureText: true, decoration: const InputDecoration(labelText: 'Nova')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Guardar')),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    final token = context.read<AuthService>().token;
    if (token == null) return;
    try {
      await PassengerAccountService(ApiClient(token)).changePassword(currentCtrl.text, newCtrl.text);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Palavra-passe alterada')));
        _load();
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    }
  }

  Future<void> _toggle2FA(BuildContext context) async {
    final enable = !(_security?.twoFactorEnabled ?? false);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Verificação em 2 passos'),
        content: Text(enable
            ? 'Receberá um código por SMS ao iniciar sessão num dispositivo novo.'
            : 'Desativar verificação em 2 passos?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: Text(enable ? 'Ativar' : 'Desativar')),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    final token = context.read<AuthService>().token;
    if (token == null) return;
    try {
      await PassengerAccountService(ApiClient(token)).setTwoFactor(enable);
      _load();
    } catch (_) {}
  }

  void _editRecoveryPhone(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Adicionar telefone de recuperação')));
  }

  void _linkGoogle(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('A associar conta Google…')));
  }
}
