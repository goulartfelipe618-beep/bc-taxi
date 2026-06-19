import 'package:flutter/material.dart';

import '../../theme/passenger_theme.dart';

class BcSearchBar extends StatelessWidget {
  const BcSearchBar({super.key, required this.hint, this.onTap});

  final String hint;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: BcColors.grayLight,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: [
              const Icon(Icons.search, size: 22, color: BcColors.black),
              const SizedBox(width: 12),
              Expanded(child: Text(hint, style: PassengerTheme.body.copyWith(color: BcColors.gray))),
            ],
          ),
        ),
      ),
    );
  }
}

class BcPillButton extends StatelessWidget {
  const BcPillButton({super.key, required this.icon, required this.label, this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: BcColors.black,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 18, color: Colors.white),
              const SizedBox(width: 6),
              Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 14)),
              const SizedBox(width: 2),
              const Icon(Icons.keyboard_arrow_down, size: 18, color: Colors.white),
            ],
          ),
        ),
      ),
    );
  }
}

class BcOutlinePillButton extends StatelessWidget {
  const BcOutlinePillButton({super.key, required this.icon, required this.label, this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: BcColors.grayLight,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 18, color: BcColors.black),
              const SizedBox(width: 6),
              Text(label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
            ],
          ),
        ),
      ),
    );
  }
}

class PlaceListTile extends StatelessWidget {
  const PlaceListTile({
    super.key,
    required this.name,
    required this.address,
    this.distanceKm,
    this.leading = Icons.history,
    this.onTap,
  });

  final String name;
  final String address;
  final double? distanceKm;
  final IconData leading;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 40,
              child: Column(
                children: [
                  Icon(leading, size: 22, color: BcColors.black),
                  if (distanceKm != null) ...[
                    const SizedBox(height: 4),
                    Text('${distanceKm!.toStringAsFixed(1)} km', style: PassengerTheme.caption),
                  ],
                ],
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name, style: PassengerTheme.titleMedium.copyWith(fontSize: 16)),
                  const SizedBox(height: 2),
                  Text(address, style: PassengerTheme.caption, maxLines: 2, overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
