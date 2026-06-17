import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/theme_provider.dart';

class ThemeSelector extends StatelessWidget {
  const ThemeSelector({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final provider = context.watch<ThemeProvider>();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.cardColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Aparência', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          Row(
            children: ThemePreference.values.map((pref) {
              final selected = provider.preference == pref;
              final label = switch (pref) {
                ThemePreference.light => 'Claro',
                ThemePreference.dark => 'Escuro',
                ThemePreference.system => 'Sistema',
              };
              return Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: FilledButton(
                    onPressed: () => provider.setPreference(pref),
                    style: FilledButton.styleFrom(
                      backgroundColor: selected ? theme.colorScheme.primary : theme.colorScheme.surface,
                      foregroundColor: selected ? theme.colorScheme.onPrimary : theme.colorScheme.onSurface,
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(20),
                        side: BorderSide(color: theme.dividerColor),
                      ),
                    ),
                    child: Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}
