import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';

import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

type Props = {
  onPress?: () => void;
};

export default function UberSearchBar({ onPress }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  return (
    <Pressable
      style={[styles.bar, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress ?? (() => router.push('/plan-trip'))}>
      <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} size={20} tintColor={colors.text} />
      <Text style={styles.placeholder}>Para onde?</Text>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <View style={styles.later}>
        <SymbolView name={{ ios: 'calendar', android: 'event', web: 'event' }} size={16} tintColor={colors.text} />
        <Text style={styles.laterText}>Mais tarde</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 32,
    borderWidth: 1,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  placeholder: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#6B6B6B',
  },
  divider: {
    width: 1,
    height: 24,
  },
  later: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  laterText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
