import 'package:flutter/material.dart';

import '../../../constants/passenger_data.dart';
import '../../../theme/passenger_theme.dart';
import '../../../widgets/passenger/bc_subpage_scaffold.dart';
import '../passenger_routes.dart';

class PersonalInfoScreen extends StatelessWidget {
  const PersonalInfoScreen({super.key, this.embedded = false});

  final bool embedded;

  @override
  Widget build(BuildContext context) {
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
        _infoRow(context, 'Nome', mockUser.name, () => _editField(context, 'Nome', mockUser.name)),
        const Divider(),
        _infoRow(context, 'Gênero', mockUser.gender, () => _pickGender(context)),
        const Divider(),
        _infoRow(context, 'Número de telefone', mockUser.phone, () => _editField(context, 'Telefone', mockUser.phone), verified: true),
        const Divider(),
        _infoRow(context, 'E-mail', mockUser.email, () => _editField(context, 'E-mail', mockUser.email), warning: true),
        const Divider(),
        BcMenuTile(
          title: 'Verificação de identidade',
          subtitle: 'Adicione o seu documento de identificação',
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

    if (embedded) return body;
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

  Future<void> _editField(BuildContext context, String label, String current) async {
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
    if (result != null && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$label atualizado')));
    }
  }

  Future<void> _pickGender(BuildContext context) async {
    const options = ['Homem', 'Mulher', 'Prefiro não dizer'];
    await showModalBottomSheet(
      context: context,
      builder: (ctx) => Column(
        mainAxisSize: MainAxisSize.min,
        children: options.map((o) => ListTile(title: Text(o), onTap: () => Navigator.pop(ctx))).toList(),
      ),
    );
  }
}
