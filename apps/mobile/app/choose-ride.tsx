import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { router, Stack } from 'expo-router';

import { Text, View } from '@/components/Themed';
import RideOptionCard from '@/components/uber/RideOptionCard';
import { RIDE_OPTIONS } from '@/constants/mockData';
import { useAppColors } from '@/components/useColorScheme';

export default function ChooseRideScreen() {
  const colors = useAppColors();
  const [selected, setSelected] = useState('bcx');
  const selectedRide = RIDE_OPTIONS.find((r) => r.id === selected) ?? RIDE_OPTIONS[0];

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        <RNView style={[styles.map, { backgroundColor: colors.mapPlaceholder }]}>
          <Pressable style={[styles.backBtn, { backgroundColor: colors.surface, shadowColor: colors.shadow }]} onPress={() => router.back()}>
            <SymbolView name={{ ios: 'arrow.left', android: 'arrow_back', web: 'arrow_back' }} size={22} tintColor={colors.text} />
          </Pressable>
          <RNView style={[styles.locationBar, { backgroundColor: colors.surface, shadowColor: colors.shadow }]}>
            <SymbolView name={{ ios: 'mappin.circle.fill', android: 'place', web: 'place' }} size={16} tintColor={colors.textSecondary} />
            <RNView>
              <Text style={[styles.locSmall, { color: colors.textSecondary }]}>Rua Pedro Pinto Felipe, 87</Text>
              <Text style={styles.locName}>Hotel Blumenau</Text>
            </RNView>
          </RNView>
          <RNView style={[styles.etaBubble, { backgroundColor: colors.surface, shadowColor: colors.shadow }]}>
            <Text style={styles.etaText}>5 min</Text>
          </RNView>
        </RNView>

        <RNView style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <Text style={styles.sheetTitle}>Escolha uma viagem</Text>
          <ScrollView style={styles.options} showsVerticalScrollIndicator={false}>
            {RIDE_OPTIONS.map((ride) => (
              <RideOptionCard
                key={ride.id}
                name={ride.name}
                capacity={ride.capacity}
                eta={ride.eta}
                arrival={ride.arrival}
                price={ride.price}
                badge={ride.badge}
                badgeColor={ride.badgeColor}
                selected={selected === ride.id}
                onPress={() => setSelected(ride.id)}
              />
            ))}
          </ScrollView>

          <RNView style={[styles.footer, { borderTopColor: colors.border }]}>
            <RNView style={styles.paymentRow}>
              <RNView style={[styles.profileToggle, { backgroundColor: colors.card }]}>
                <RNView style={[styles.profileActive, { backgroundColor: colors.buttonBg }]}>
                  <SymbolView name={{ ios: 'person.fill', android: 'person', web: 'person' }} size={16} tintColor={colors.onPrimary} />
                </RNView>
                <SymbolView name={{ ios: 'briefcase.fill', android: 'work', web: 'work' }} size={16} tintColor={colors.textSecondary} />
              </RNView>
              <RNView style={styles.paymentInfo}>
                <Text style={styles.paymentLabel}>Pessoal</Text>
                <Text style={[styles.paymentMethod, { color: colors.textSecondary }]}>PIX</Text>
              </RNView>
              <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={16} tintColor={colors.textSecondary} />
            </RNView>

            <RNView style={styles.actionRow}>
              <Pressable style={[styles.confirmBtn, { backgroundColor: colors.buttonBg }]}>
                <Text style={[styles.confirmText, { color: colors.onPrimary }]}>Escolher {selectedRide.name}</Text>
              </Pressable>
              <Pressable style={[styles.scheduleBtn, { borderColor: colors.border }]}>
                <SymbolView name={{ ios: 'calendar', android: 'event', web: 'event' }} size={22} tintColor={colors.text} />
              </Pressable>
            </RNView>
          </RNView>
        </RNView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1, position: 'relative' },
  backBtn: {
    position: 'absolute',
    top: 48,
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  locationBar: {
    position: 'absolute',
    top: 48,
    left: 72,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  locSmall: { fontSize: 12 },
  locName: { fontSize: 15, fontWeight: '700' },
  etaBubble: {
    position: 'absolute',
    top: '45%',
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  etaText: { fontWeight: '700', fontSize: 13 },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 20,
    maxHeight: '55%',
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  options: { paddingHorizontal: 8 },
  footer: { padding: 16, gap: 12, borderTopWidth: 1 },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  profileToggle: { flexDirection: 'row', borderRadius: 20, padding: 4, gap: 4 },
  profileActive: { borderRadius: 16, padding: 6 },
  paymentInfo: { flex: 1 },
  paymentLabel: { fontWeight: '700', fontSize: 14 },
  paymentMethod: { fontSize: 13 },
  actionRow: { flexDirection: 'row', gap: 10 },
  confirmBtn: { flex: 1, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  confirmText: { fontWeight: '700', fontSize: 16 },
  scheduleBtn: { width: 52, height: 52, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
