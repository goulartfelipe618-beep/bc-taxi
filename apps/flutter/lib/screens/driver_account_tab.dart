import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../services/driver_account_service.dart';
import 'driver_compliance_screen.dart';

class DriverAccountTab extends StatefulWidget {
  const DriverAccountTab({super.key});

  @override
  State<DriverAccountTab> createState() => _DriverAccountTabState();
}

class _DriverAccountTabState extends State<DriverAccountTab> {
  DriverAccountDashboard? _dashboard;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  DriverAccountService? get _service {
    final token = context.read<AuthService>().token;
    if (token == null) return null;
    return DriverAccountService(ApiClient(token));
  }

  Future<void> _load() async {
    final service = _service;
    if (service == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final dashboard = await service.fetchDashboard();
      if (!mounted) return;
      setState(() {
        _dashboard = dashboard;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _openMessage(DriverInboxMessage message) async {
    final service = _service;
    if (service == null) return;
    if (!message.isRead) {
      await service.markMessageRead(message.id);
      await _load();
    }
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(message.title),
        content: SingleChildScrollView(child: Text(message.body)),
        actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Fechar'))],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            FilledButton(onPressed: _load, child: const Text('Tentar novamente')),
          ],
        ),
      );
    }

    final dashboard = _dashboard!;
    final profile = dashboard.profile;
    final rating = profile.rating?.toStringAsFixed(2).replaceAll('.', ',') ?? '—';

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(profile.fullName, style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800)),
          Text(profile.email, style: TextStyle(color: Colors.grey[600])),
          const SizedBox(height: 8),
          Row(
            children: [
              const Icon(Icons.star, size: 16),
              Text(' $rating'),
              if (profile.tier != null) ...[
                const SizedBox(width: 8),
                Chip(label: Text(profile.tier!), visualDensity: VisualDensity.compact),
              ],
            ],
          ),
          const SizedBox(height: 16),
          if (dashboard.earnings != null)
            Card(
              child: ListTile(
                leading: const Icon(Icons.account_balance_wallet_outlined),
                title: const Text('Saldo disponível'),
                subtitle: Text(dashboard.earnings!.availableLabel),
                trailing: dashboard.payoutSummaryRideCount > 0
                    ? Text('${dashboard.payoutSummaryRideCount} corridas')
                    : null,
              ),
            ),
          ListTile(
            leading: const Icon(Icons.description_outlined),
            title: const Text('Veículo e documentos'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const DriverComplianceScreen()),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.shield_outlined),
            title: const Text('Segurança'),
            subtitle: Text('2FA ${profile.passwordChangedLabel != null ? '· senha alterada' : ''}'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _showSecuritySheet(),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              const Text('Mensagens', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              if (dashboard.unreadMessageCount > 0) ...[
                const SizedBox(width: 8),
                CircleAvatar(
                  radius: 10,
                  backgroundColor: Colors.red,
                  child: Text(
                    '${dashboard.unreadMessageCount}',
                    style: const TextStyle(color: Colors.white, fontSize: 10),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 8),
          if (dashboard.recentMessages.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Text('Nenhuma mensagem'),
            )
          else
            ...dashboard.recentMessages.map(
              (m) => ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  m.isRead ? Icons.mail_outline : Icons.mark_email_unread_outlined,
                  color: m.isRead ? Colors.grey : Theme.of(context).colorScheme.primary,
                ),
                title: Text(m.title, maxLines: 1, overflow: TextOverflow.ellipsis),
                subtitle: Text(m.preview, maxLines: 2, overflow: TextOverflow.ellipsis),
                onTap: () => _openMessage(m),
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _showSecuritySheet() async {
    final service = _service;
    if (service == null) return;
    DriverSecuritySummary? security;
    try {
      security = await service.fetchSecurity();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      return;
    }
    if (!mounted) return;

    var twoFactor = security.twoFactorEnabled;
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Segurança', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Palavra-passe'),
                subtitle: Text(security!.passwordChangedLabel),
              ),
              if (security.pixKeyMasked != null)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Chave PIX'),
                  subtitle: Text(security.pixKeyMasked!),
                ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Autenticação em dois fatores'),
                value: twoFactor,
                onChanged: (v) async {
                  try {
                    await service!.setTwoFactor(v);
                    setSheetState(() => twoFactor = v);
                  } catch (e) {
                    if (ctx.mounted) {
                      ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(content: Text(e.toString())));
                    }
                  }
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
