import 'package:flutter/material.dart';
import '../config/theme.dart';

class VehicleTypeSelector extends StatelessWidget {
  final String selected;
  final Map<String, double> prices;
  final ValueChanged<String> onSelect;

  const VehicleTypeSelector({
    super.key,
    required this.selected,
    required this.prices,
    required this.onSelect,
  });

  static const types = ['economy', 'comfort', 'premium'];

  @override
  Widget build(BuildContext context) {
    return Row(
      children: types.map((type) {
        final isSelected = selected == type;
        return Expanded(
          child: Padding(
            padding: EdgeInsets.only(
              right: type != 'premium' ? 8 : 0,
            ),
            child: GestureDetector(
              onTap: () => onSelect(type),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
                decoration: BoxDecoration(
                  color: isSelected ? const Color(0xFFFFF8E1) : Colors.white,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: isSelected ? AppTheme.primary : const Color(0xFFE0E0E0),
                    width: 1.5,
                  ),
                ),
                child: Column(
                  children: [
                    Text(
                      AppTheme.vehicleLabels[type] ?? type,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: isSelected ? AppTheme.darkColor : AppTheme.textSecondary,
                      ),
                    ),
                    if (prices[type] != null)
                      Text(
                        'R\$ ${prices[type]!.toStringAsFixed(2)}',
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppTheme.textSecondary,
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}
