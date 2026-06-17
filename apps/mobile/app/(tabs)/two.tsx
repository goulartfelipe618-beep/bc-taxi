import { StyleSheet } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

export default function RidesScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  return (
    <View style={styles.container}>
      <SymbolView
        name={{ ios: 'car.fill', android: 'directions_car', web: 'directions_car' }}
        size={48}
        tintColor={colors.textSecondary}
      />
      <Text style={styles.title}>Suas viagens</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Histórico de corridas aparecerá aqui
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
});
