import 'package:flutter/material.dart';
import '../config/theme.dart';
import '../data/mock_data.dart';

class RideOptionTile extends StatelessWidget {
  final MockRideOption option;
  final bool selected;
  final VoidCallback onTap;

  const RideOptionTile({
    super.key,
    required this.option,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: selected ? AppTheme.black : Colors.transparent, width: 2),
          color: selected ? AppTheme.gray100 : null,
        ),
        child: Row(
          children: [
            const Icon(Icons.directions_car, size: 32),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(option.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                      const SizedBox(width: 6),
                      const Icon(Icons.person, size: 12, color: AppTheme.gray400),
                      Text('${option.capacity}', style: const TextStyle(color: AppTheme.gray400, fontSize: 12)),
                    ],
                  ),
                  Text('${option.arrival} · ${option.eta}', style: const TextStyle(color: AppTheme.gray400, fontSize: 13)),
                  if (option.badge != null)
                    Container(
                      margin: const EdgeInsets.only(top: 4),
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: option.badgeColor ?? AppTheme.accent,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(option.badge!, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
                    ),
                ],
              ),
            ),
            Text('${option.price} R\$', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
          ],
        ),
      ),
    );
  }
}
