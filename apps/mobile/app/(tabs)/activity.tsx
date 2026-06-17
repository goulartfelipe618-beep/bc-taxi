import { ScrollView, Pressable, StyleSheet, View as RNView } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { PAST_TRIPS } from '@/constants/mockData';
import { useColorScheme } from '@/components/useColorScheme';

export default function ActivityScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const featured = PAST_TRIPS[0];

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Atividade</Text>

        <RNView style={[styles.featuredCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <RNView style={[styles.mapPreview, { backgroundColor: colors.card }]}>
            <SymbolView name={{ ios: 'map.fill', android: 'map', web: 'map' }} size={32} tintColor={colors.textSecondary} />
          </RNView>
          <Text style={styles.featuredAddress}>{featured.address}</Text>
          <Text style={[styles.featuredMeta, { color: colors.textSecondary }]}>
            {featured.date} · {featured.price}
          </Text>
          <Pressable style={[styles.rebookBtn, { backgroundColor: colors.card }]}>
            <SymbolView name={{ ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' }} size={16} tintColor={colors.text} />
            <Text style={styles.rebookText}>Reservar</Text>
          </Pressable>
        </RNView>

        <RNView style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Anteriores</Text>
          <Pressable style={[styles.filterBtn, { backgroundColor: colors.card }]}>
            <SymbolView name={{ ios: 'slider.horizontal.3', android: 'tune', web: 'tune' }} size={18} tintColor={colors.text} />
          </Pressable>
        </RNView>

        {PAST_TRIPS.map((trip) => (
          <RNView key={trip.id} style={[styles.tripRow, { borderBottomColor: colors.border }]}>
            <RNView style={[styles.tripThumb, { backgroundColor: colors.card }]}>
              <SymbolView
                name={{ ios: 'car.fill', android: trip.type === 'Moto' ? 'two_wheeler' : 'directions_car', web: trip.type === 'Moto' ? 'two_wheeler' : 'directions_car' }}
                size={20}
                tintColor={colors.text}
              />
            </RNView>
            <RNView style={styles.tripInfo}>
              <Text style={styles.tripAddress} numberOfLines={1}>{trip.address}</Text>
              <Text style={[styles.tripMeta, { color: colors.textSecondary }]}>{trip.date}</Text>
              <Text style={[styles.tripPrice, { color: colors.textSecondary }]}>{trip.price}</Text>
            </RNView>
            <Pressable style={[styles.rebookSmall, { backgroundColor: colors.card }]}>
              <Text style={styles.rebookSmallText}>Reservar</Text>
            </Pressable>
          </RNView>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 20 },
  featuredCard: { borderRadius: 12, borderWidth: 1, padding: 16, marginBottom: 24, gap: 8 },
  mapPreview: { height: 120, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  featuredAddress: { fontSize: 16, fontWeight: '700' },
  featuredMeta: { fontSize: 14 },
  rebookBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginTop: 4 },
  rebookText: { fontWeight: '700', fontSize: 13 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  filterBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  tripRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  tripThumb: { width: 48, height: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tripInfo: { flex: 1, gap: 2 },
  tripAddress: { fontSize: 15, fontWeight: '700' },
  tripMeta: { fontSize: 13 },
  tripPrice: { fontSize: 13 },
  rebookSmall: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  rebookSmallText: { fontWeight: '700', fontSize: 12 },
});
