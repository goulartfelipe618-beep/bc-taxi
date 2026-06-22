import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../constants/passenger_data.dart';
import '../../../services/api_client.dart';
import '../../../services/auth_service.dart';
import '../../../services/passenger_account_service.dart';
import '../../../theme/passenger_theme.dart';
import '../../../widgets/passenger/bc_subpage_scaffold.dart';
import '../passenger_routes.dart';

class PersonalInfoScreen extends StatefulWidget {
  const PersonalInfoScreen({super.key, this.embedded = false});

  final bool embedded;

  @override
  State<PersonalInfoScreen> createState() => _PersonalInfoScreenState();
}

class _PersonalInfoScreenState extends State<PersonalInfoScreen> {
  PassengerAccountProfile? _profile;
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
      final dashboard = await PassengerAccountService(ApiClient(token)).fetchDashboard();
      if (!mounted) return;
      setState(() {
        _profile = dashboard.profile;
        _loading = false;
      });
    } catch (_) {
      _useFallback();
    }
  }

  void _useFallback() {
    if (!mounted) return;
    setState(() {
      _profile = PassengerAccountProfile(
        fullName: mockUser.name,
        email: mockUser.email,
        phone: mockUser.phone,
        gender: mockUser.gender,
        rating: mockUser.rating,
      );
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      final loading = const Center(child: CircularProgressIndicator());
      if (widget.embedded) return loading;
      return BcSubpageScaffold(title: 'Informações pessoais', body: loading);
    }

    final profile = _profile!;
    final body = ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Center(
          child: Stack(
            children: [
              const CircleAvatar(radius: 48, child: Icon(Icons.person, size: 48)),
              Positioned(
                right: 0,
                bottom: 0,
                child: CircleAvatar(
                  radius: 16,
                  backgroundColor: Colors.white,
                  child: IconButton(
                    padding: EdgeInsets.zero,
                    iconSize: 18,
                    icon: const Icon(Icons.edit),
                    onPressed: () => _showPhotoOptions(context),
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        _infoRow(context, 'Nome', profile.fullName, () => _editField(context, 'Nome', profile.fullName, 'fullName')),
        const Divider(),
        _infoRow(context, 'Gênero', profile.gender ?? '—', () => _pickGender(context)),
        const Divider(),
        _infoRow(
          context,
          'Número de telefone',
          profile.phone ?? '—',
          () => _editField(context, 'Telefone', profile.phone ?? '', 'phone'),
          verified: profile.phoneVerified,
        ),
        const Divider(),
        _infoRow(
          context,
          'E-mail',
          profile.email,
          () => _editField(context, 'E-mail', profile.email, 'email', readOnly: true),
          warning: !profile.emailVerified,
        ),
        const Divider(),
        BcMenuTile(
          title: 'Verificação de identidade',
          subtitle: profile.identityStatus == 'verified' ? 'Verificado' : 'Adicione o seu documento de identificação',
          onTap: () => PassengerRoutes.openVerification(context),
        ),
        const Divider(),
        BcMenuTile(
          title: 'Idioma',
          subtitle: 'Atualizar o idioma do dispositivo',
          icon: Icons.open_in_new,
          onTap: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Abrir definições do sistema'))),
        ),
      ],
    );

    if (widget.embedded) return body;
    return BcSubpageScaffold(title: 'Informações pessoais', body: body);
  }

  Widget _infoRow(BuildContext context, String label, String value, VoidCallback onTap, {bool verified = false, bool warning = false}) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 14),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                  const SizedBox(height: 4),
                  Text(value, style: PassengerTheme.caption),
                ],
              ),
            ),
            if (verified) const Icon(Icons.check_circle, color: BcColors.green, size: 18),
            if (warning) const Icon(Icons.warning_amber, color: Colors.amber, size: 18),
            const SizedBox(width: 8),
            const Icon(Icons.chevron_right, color: BcColors.gray),
          ],
        ),
      ),
    );
  }

  void _showPhotoOptions(BuildContext context) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(title: const Text('Tirar foto'), onTap: () => Navigator.pop(ctx)),
            ListTile(title: const Text('Escolher da galeria'), onTap: () => Navigator.pop(ctx)),
          ],
        ),
      ),
    );
  }

  Future<void> _editField(BuildContext context, String label, String current, String field, {bool readOnly = false}) async {
    if (readOnly) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('E-mail não pode ser alterado aqui')));
      return;
    }
    final result = await showDialog<String>(
      context: context,
      builder: (ctx) {
        final c = TextEditingController(text: current);
        return AlertDialog(
          title: Text('Alterar $label'),
          content: TextField(controller: c),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
            TextButton(onPressed: () => Navigator.pop(ctx, c.text), child: const Text('Guardar')),
          ],
        );
      },
    );
    if (result == null || !context.mounted) return;
    final token = context.read<AuthService>().token;
    if (token == null) return;
    try {
      final updated = await PassengerAccountService(ApiClient(token)).updateProfile({field: result});
      setState(() => _profile = updated.profile);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$label atualizado')));
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    }
  }

  Future<void> _pickGender(BuildContext context) async {
    const options = ['Homem', 'Mulher', 'Prefiro não dizer'];
    final selected = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => Column(
        mainAxisSize: MainAxisSize.min,
        children: options.map((o) => ListTile(title: Text(o), onTap: () => Navigator.pop(ctx, o))).toList(),
      ),
    );
    if (selected == null || !context.mounted) return;
    final token = context.read<AuthService>().token;
    if (token == null) return;
    try {
      final updated = await PassengerAccountService(ApiClient(token)).updateProfile({'gender': selected});
      setState(() => _profile = updated.profile);
    } catch (_) {}
  }
}
