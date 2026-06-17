import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Text } from '@/components/Themed';

type Props = {
  name: string;
  capacity: number;
  eta: string;
  arrival: string;
  price: string;
  selected?: boolean;
  badge?: string;
  badgeColor?: string;
  onPress?: () => void;
};

export default function RideOptionCard({
  name,
  capacity,
  eta,
  arrival,
  price,
  selected,
  badge,
  badgeColor,
  onPress,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, selected && styles.cardSelected]}>
      <View style={styles.carIcon}>
        <SymbolView name={{ ios: 'car.fill', android: 'directions_car', web: 'directions_car' }} size={28} tintColor="#000" />
      </View>
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{name}</Text>
          <SymbolView name={{ ios: 'person.fill', android: 'person', web: 'person' }} size={12} tintColor="#6B6B6B" />
          <Text style={styles.capacity}>{capacity}</Text>
        </View>
        <Text style={styles.eta}>
          {arrival} · {eta}
        </Text>
        {badge ? (
          <View style={[styles.badge, { backgroundColor: badgeColor ?? '#276EF1' }]}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.price}>{price} R$</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 12,
  },
  cardSelected: {
    borderColor: '#000',
    backgroundColor: '#FAFAFA',
  },
  carIcon: {
    width: 56,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { fontSize: 16, fontWeight: '700' },
  capacity: { fontSize: 12, color: '#6B6B6B' },
  eta: { fontSize: 13, color: '#6B6B6B' },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  badgeText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  price: { fontSize: 15, fontWeight: '700' },
});
