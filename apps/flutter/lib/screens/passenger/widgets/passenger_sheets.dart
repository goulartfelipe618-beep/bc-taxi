import 'package:flutter/material.dart';

import '../../../theme/passenger_theme.dart';

Future<String?> showChangeProfileSheet(BuildContext context, String current) {
  return showModalBottomSheet<String>(
    context: context,
    backgroundColor: Colors.white,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
    builder: (ctx) => _ChangeProfileSheet(initial: current),
  );
}

class _ChangeProfileSheet extends StatefulWidget {
  const _ChangeProfileSheet({required this.initial});

  final String initial;

  @override
  State<_ChangeProfileSheet> createState() => _ChangeProfileSheetState();
}

class _ChangeProfileSheetState extends State<_ChangeProfileSheet> {
  late String _selected = widget.initial;

  @override
  Widget build(BuildContext context) {
    const options = [
      ('Pessoal', Icons.person_outline),
      ('Empresarial', Icons.work_outline),
    ];

    return Padding(
      padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: MediaQuery.of(context).viewInsets.bottom + 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Mudar de perfil', style: PassengerTheme.titleMedium, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: BcColors.blue.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(12)),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.campaign_outlined, color: BcColors.blue),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Permita que um representante peça as suas viagens. Edite o seu perfil para adicionar um representante.',
                    style: PassengerTheme.caption.copyWith(color: BcColors.black),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          ...options.map((o) {
            final selected = _selected == o.$1;
            return ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(o.$2),
              title: Text(o.$1, style: const TextStyle(fontWeight: FontWeight.w600)),
              trailing: Icon(selected ? Icons.radio_button_checked : Icons.radio_button_off, color: BcColors.black),
              onTap: () => setState(() => _selected = o.$1),
            );
          }),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: () => Navigator.pop(context, _selected),
            style: FilledButton.styleFrom(backgroundColor: BcColors.black, padding: const EdgeInsets.symmetric(vertical: 16)),
            child: const Text('Concluído', style: TextStyle(fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }
}

Future<String?> showProfilePickerSheet(BuildContext context, String current) {
  const options = ['Para mim', 'Para outra pessoa'];
  return showModalBottomSheet<String>(
    context: context,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
    builder: (ctx) => Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Quem vai viajar?', style: PassengerTheme.titleMedium),
          const SizedBox(height: 12),
          ...options.map(
            (o) => ListTile(
              title: Text(o),
              trailing: o == current ? const Icon(Icons.check, color: BcColors.black) : null,
              onTap: () => Navigator.pop(ctx, o),
            ),
          ),
        ],
      ),
    ),
  );
}

Future<DateTime?> showScheduleTimeSheet(BuildContext context) async {
  final now = DateTime.now();
  final date = await showDatePicker(
    context: context,
    initialDate: now,
    firstDate: now,
    lastDate: now.add(const Duration(days: 30)),
  );
  if (date == null || !context.mounted) return null;
  final time = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(now.add(const Duration(hours: 1))));
  if (time == null) return null;
  return DateTime(date.year, date.month, date.day, time.hour, time.minute);
}

Future<String?> showPickupTimeSheet(BuildContext context, String current) {
  const options = ['Recolher agora', 'Recolher mais tarde'];
  return showModalBottomSheet<String>(
    context: context,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
    builder: (ctx) => Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Quando?', style: PassengerTheme.titleMedium),
          const SizedBox(height: 12),
          ...options.map(
            (o) => ListTile(
              title: Text(o),
              trailing: o == current ? const Icon(Icons.check) : null,
              onTap: () => Navigator.pop(ctx, o),
            ),
          ),
        ],
      ),
    ),
  );
}

Future<String?> showEditTextSheet(BuildContext context, {required String title, required String initial, required String hint}) {
  final controller = TextEditingController(text: initial == hint ? '' : initial);
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
    builder: (ctx) => Padding(
      padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: MediaQuery.of(ctx).viewInsets.bottom + 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title, style: PassengerTheme.titleMedium),
          const SizedBox(height: 12),
          TextField(
            controller: controller,
            autofocus: true,
            decoration: InputDecoration(hintText: hint, border: OutlineInputBorder(borderRadius: BorderRadius.circular(12))),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, controller.text.trim().isEmpty ? null : controller.text.trim()),
            style: FilledButton.styleFrom(backgroundColor: BcColors.black),
            child: const Text('Confirmar'),
          ),
        ],
      ),
    ),
  );
}
