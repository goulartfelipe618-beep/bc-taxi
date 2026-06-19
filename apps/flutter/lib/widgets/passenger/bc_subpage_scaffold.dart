import 'package:flutter/material.dart';

import '../../theme/passenger_theme.dart';

class BcSubpageScaffold extends StatelessWidget {
  const BcSubpageScaffold({
    super.key,
    required this.title,
    required this.body,
    this.subtitle,
    this.actions,
  });

  final String title;
  final String? subtitle;
  final Widget body;
  final List<Widget>? actions;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        foregroundColor: BcColors.black,
        elevation: 0,
        leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => Navigator.pop(context)),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
        actions: actions,
      ),
      body: body,
    );
  }
}

class BcMenuTile extends StatelessWidget {
  const BcMenuTile({
    super.key,
    required this.title,
    this.subtitle,
    this.icon = Icons.chevron_right,
    this.leading,
    this.trailing,
    this.onTap,
  });

  final String title;
  final String? subtitle;
  final IconData icon;
  final Widget? leading;
  final Widget? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (leading != null) ...[leading!, const SizedBox(width: 12)],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                  if (subtitle != null) ...[
                    const SizedBox(height: 4),
                    Text(subtitle!, style: PassengerTheme.caption),
                  ],
                ],
              ),
            ),
            trailing ?? Icon(icon, color: BcColors.gray, size: 20),
          ],
        ),
      ),
    );
  }
}
