import { useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View as RNView,
} from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

const VEHICLE_TYPES = [
  { id: 'economy', label: 'Econômico', price: 'R$ 12,50' },
  { id: 'comfort', label: 'Conforto', price: 'R$ 18,90' },
  { id: 'premium', label: 'Premium', price: 'R$ 28,00' },
] as const;

export default function HomeScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const [destination, setDestination] = useState('');
  const [vehicleType, setVehicleType] = useState<string>('economy');

  return (
    <View style={styles.container}>
      <RNView style={[styles.mapArea, { backgroundColor: colors.textSecondary + '33' }]}>
        <SymbolView
          name={{ ios: 'map.fill', android: 'map', web: 'map' }}
          size={48}
          tintColor={colors.textSecondary}
        />
        <Text style={[styles.mapHint, { color: colors.textSecondary }]}>
          Mapa — mobilidade urbana BC Taxi
        </Text>
      </RNView>

      <RNView style={[styles.sheet, { backgroundColor: colors.card }]}>
        <Text style={styles.sheetTitle}>Para onde?</Text>
        <TextInput
          value={destination}
          onChangeText={setDestination}
          placeholder="Digite o destino"
          placeholderTextColor={colors.textSecondary}
          style={[
            styles.input,
            {
              color: colors.text,
              borderColor: colors.textSecondary + '44',
              backgroundColor: colorScheme === 'dark' ? colors.dark : '#FFFFFF',
            },
          ]}
        />

        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          Tipo de veículo
        </Text>
        <RNView style={styles.vehicleRow}>
          {VEHICLE_TYPES.map((type) => {
            const selected = vehicleType === type.id;
            return (
              <Pressable
                key={type.id}
                onPress={() => setVehicleType(type.id)}
                style={[
                  styles.vehicleChip,
                  {
                    borderColor: selected ? colors.primary : colors.textSecondary + '44',
                    backgroundColor: selected ? colors.primary + '22' : 'transparent',
                  },
                ]}>
                <Text style={[styles.vehicleLabel, selected && { fontWeight: '700' }]}>
                  {type.label}
                </Text>
                <Text style={[styles.vehiclePrice, { color: colors.textSecondary }]}>
                  {type.price}
                </Text>
              </Pressable>
            );
          })}
        </RNView>

        <Pressable
          style={[styles.cta, { backgroundColor: colors.primary }]}
          onPress={() => {}}>
          <Text style={styles.ctaText}>Solicitar corrida</Text>
        </Pressable>
      </RNView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mapArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  mapHint: {
    fontSize: 14,
  },
  sheet: {
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
      default: { boxShadow: '0 -2px 12px rgba(0,0,0,0.08)' },
    }),
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  vehicleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  vehicleChip: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    gap: 4,
  },
  vehicleLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
  vehiclePrice: {
    fontSize: 11,
  },
  cta: {
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
  },
});
