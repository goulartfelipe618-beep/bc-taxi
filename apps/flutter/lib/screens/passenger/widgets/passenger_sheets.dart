import 'package:flutter/material.dart';

import '../../../theme/passenger_theme.dart';

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
