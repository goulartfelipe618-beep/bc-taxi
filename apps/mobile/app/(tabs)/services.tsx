import { ScrollView, Pressable, StyleSheet, View as RNView } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';

import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

const SERVICES = [
  { id: 'ride', label: 'Viajar', icon: 'directions_car' as const, route: '/plan-trip' },
  { id: 'moto', label: 'Moto', icon: 'two_wheeler' as const, route: '/plan-trip' },
  { id: 'reserve', label: 'Reservar', icon: 'event' as const, route: '/plan-trip' },
  { id: 'food', label: 'Entregas', icon: 'local_shipping' as const, route: '/plan-trip' },
  { id: 'rental', label: 'Aluguer', icon: 'car_rental' as const, route: '/plan-trip' },
  { id: 'transit', label: 'Transporte', icon: 'directions_bus' as const, route: '/plan-trip' },
];

export default function ServicesScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Serviços</Text>
      <ScrollView contentContainerStyle={styles.grid}>
        {SERVICES.map((s) => (
          <Pressable
            key={s.id}
            style={[styles.card, { backgroundColor: colors.card }]}
            onPress={() => router.push(s.route as '/plan-trip')}>
            <RNView style={[styles.iconWrap, { backgroundColor: colors.surface }]}>
              <SymbolView name={{ ios: 'car.fill', android: s.icon, web: s.icon }} size={28} tintColor={colors.text} />
            </RNView>
            <Text style={styles.label}>{s.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { width: '47%', padding: 16, borderRadius: 12, gap: 12 },
  iconWrap: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 15, fontWeight: '700' },
});
