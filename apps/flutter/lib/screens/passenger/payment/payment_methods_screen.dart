import 'package:flutter/material.dart';

import '../../../constants/passenger_data.dart';
import '../../../theme/passenger_theme.dart';
import '../../../widgets/passenger/bc_subpage_scaffold.dart';

class PaymentMethodsScreen extends StatefulWidget {
  const PaymentMethodsScreen({super.key});

  @override
  State<PaymentMethodsScreen> createState() => _PaymentMethodsScreenState();
}

class _PaymentMethodsScreenState extends State<PaymentMethodsScreen> {
  late String _selected = paymentMethods.firstWhere((m) => m.isDefault).id;

  @override
  Widget build(BuildContext context) {
    return BcSubpageScaffold(
      title: 'Pagamento',
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Perfil de faturação', style: PassengerTheme.titleMedium),
          const SizedBox(height: 12),
          Row(
            children: [
              _profileChip('Pessoal', Icons.person_outline, true),
              const SizedBox(width: 10),
              _profileChip('Empresarial', Icons.work_outline, false),
            ],
          ),
          const SizedBox(height: 24),
          Text('Métodos de pagamento', style: PassengerTheme.titleMedium),
          const SizedBox(height: 8),
          ...paymentMethods.map((m) {
            final selected = m.id == _selected;
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Material(
                color: selected ? BcColors.grayLight : Colors.white,
                borderRadius: BorderRadius.circular(12),
                child: InkWell(
                  onTap: () => setState(() => _selected = m.id),
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: selected ? BcColors.black : BcColors.border, width: selected ? 2 : 1),
                    ),
                    child: Row(
                      children: [
                        Icon(m.icon),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(m.label, style: const TextStyle(fontWeight: FontWeight.w600)),
                              if (m.subtitle != null) Text(m.subtitle!, style: PassengerTheme.caption),
                            ],
                          ),
                        ),
                        if (selected) const Icon(Icons.check_circle, color: BcColors.black),
                      ],
                    ),
                  ),
                ),
              ),
            );
          }),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Adicionar cartão'))),
            icon: const Icon(Icons.add),
            label: const Text('Adicionar método'),
          ),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: () {
              Navigator.pop(context, paymentMethods.firstWhere((m) => m.id == _selected).label);
            },
            style: FilledButton.styleFrom(backgroundColor: BcColors.black, padding: const EdgeInsets.symmetric(vertical: 16)),
            child: const Text('Confirmar'),
          ),
        ],
      ),
    );
  }

  Widget _profileChip(String label, IconData icon, bool active) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: active ? BcColors.black : BcColors.grayLight,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: active ? Colors.white : BcColors.black, size: 18),
            const SizedBox(width: 6),
            Text(label, style: TextStyle(fontWeight: FontWeight.w600, color: active ? Colors.white : BcColors.black)),
          ],
        ),
      ),
    );
  }
}
