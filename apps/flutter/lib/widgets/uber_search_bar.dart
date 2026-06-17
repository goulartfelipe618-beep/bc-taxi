import 'package:flutter/material.dart';
import '../../config/theme.dart';

class UberSearchBar extends StatelessWidget {
  final VoidCallback? onTap;

  const UberSearchBar({super.key, this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(32),
        child: Ink(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(32),
            border: Border.all(color: AppTheme.gray200),
            boxShadow: const [
              BoxShadow(color: Colors.black12, blurRadius: 8, offset: Offset(0, 2)),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: Row(
              children: [
                const Icon(Icons.search, size: 22),
                const SizedBox(width: 12),
                const Expanded(
                  child: Text(
                    'Para onde?',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500, color: AppTheme.gray400),
                  ),
                ),
                Container(width: 1, height: 24, color: AppTheme.gray200),
                const SizedBox(width: 12),
                const Icon(Icons.calendar_today_outlined, size: 16),
                const SizedBox(width: 4),
                const Text('Mais tarde', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
