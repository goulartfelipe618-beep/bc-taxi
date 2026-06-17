import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Text } from '@/components/Themed';
import { useAppColors } from '@/components/useColorScheme';
import type { ThemePreference } from '@/contexts/ThemeContext';
import { useTheme } from '@/contexts/ThemeContext';

const OPTIONS: { id: ThemePreference; label: string; icon: string }[] = [
  { id: 'light', label: 'Claro', icon: 'light_mode' },
  { id: 'dark', label: 'Escuro', icon: 'dark_mode' },
  { id: 'system', label: 'Sistema', icon: 'settings_brightness' },
];

export default function ThemeSelector() {
  const { preference, setPreference } = useTheme();
  const colors = useAppColors();

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      <Text style={styles.title}>Aparência</Text>
      <View style={styles.row}>
        {OPTIONS.map((opt) => {
          const selected = preference === opt.id;
          return (
            <Pressable
              key={opt.id}
              onPress={() => setPreference(opt.id)}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? colors.buttonBg : colors.surface,
                  borderColor: selected ? colors.buttonBg : colors.border,
                },
              ]}>
              <SymbolView
                name={{ ios: 'circle.fill', android: opt.icon, web: opt.icon }}
                size={16}
                tintColor={selected ? colors.onPrimary : colors.text}
              />
              <Text style={[styles.chipText, { color: selected ? colors.onPrimary : colors.text }]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 12, padding: 16, marginBottom: 16, gap: 12 },
  title: { fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: '700' },
});
