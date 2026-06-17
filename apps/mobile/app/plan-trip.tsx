import { useState } from 'react';
import { ScrollView, Pressable, StyleSheet, TextInput, View as RNView } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { router, Stack } from 'expo-router';

import { Text, View } from '@/components/Themed';
import ThemeSelector from '@/components/ThemeSelector';
import { PICKUP_ADDRESS, RECENT_LOCATIONS } from '@/constants/mockData';
import { useAppColors } from '@/components/useColorScheme';

export default function PlanTripScreen() {
  const colors = useAppColors();
  const [destination, setDestination] = useState('');

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        <RNView style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <SymbolView name={{ ios: 'arrow.left', android: 'arrow_back', web: 'arrow_back' }} size={22} tintColor={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Planeie a sua viagem</Text>
          <RNView style={{ width: 40 }} />
        </RNView>

        <RNView style={styles.pills}>
          <Pressable style={[styles.pill, { backgroundColor: colors.buttonBg }]}>
            <SymbolView name={{ ios: 'clock.fill', android: 'schedule', web: 'schedule' }} size={16} tintColor={colors.onPrimary} />
            <Text style={[styles.pillText, { color: colors.onPrimary }]}>Recolher agora</Text>
            <SymbolView name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }} size={14} tintColor={colors.onPrimary} />
          </Pressable>
          <Pressable style={[styles.pill, { backgroundColor: colors.card }]}>
            <SymbolView name={{ ios: 'person.fill', android: 'person', web: 'person' }} size={16} tintColor={colors.text} />
            <Text style={styles.pillText}>Para mim</Text>
            <SymbolView name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }} size={14} tintColor={colors.text} />
          </Pressable>
        </RNView>

        <RNView style={[styles.inputBox, { borderColor: colors.text }]}>
          <RNView style={styles.routeDots}>
            <RNView style={[styles.dot, { borderColor: colors.text }]} />
            <RNView style={[styles.line, { backgroundColor: colors.text }]} />
            <RNView style={[styles.square, { backgroundColor: colors.text }]} />
          </RNView>
          <RNView style={styles.inputs}>
            <Text style={styles.pickup}>{PICKUP_ADDRESS}</Text>
            <TextInput
              value={destination}
              onChangeText={setDestination}
              placeholder="Para onde?"
              placeholderTextColor={colors.textSecondary}
              style={[styles.destInput, { color: colors.text }]}
              onSubmitEditing={() => router.push('/choose-ride')}
            />
          </RNView>
          <Pressable style={[styles.addBtn, { borderColor: colors.border }]}>
            <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={18} tintColor={colors.text} />
          </Pressable>
        </RNView>

        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          <RNView style={styles.savedHeader}>
            <SymbolView name={{ ios: 'star', android: 'star_border', web: 'star_border' }} size={18} tintColor={colors.text} />
            <Text style={styles.savedTitle}>Locais guardados</Text>
          </RNView>

          {RECENT_LOCATIONS.map((loc) => (
            <Pressable
              key={loc.id}
              style={[styles.locRow, { borderBottomColor: colors.border }]}
              onPress={() => router.push('/choose-ride')}>
              <RNView style={styles.locLeft}>
                <SymbolView name={{ ios: 'clock.fill', android: 'schedule', web: 'schedule' }} size={18} tintColor={colors.textSecondary} />
                <Text style={[styles.distance, { color: colors.textSecondary }]}>{loc.distance}</Text>
              </RNView>
              <RNView style={styles.locText}>
                <Text style={styles.locName}>{loc.name}</Text>
                <Text style={[styles.locAddress, { color: colors.textSecondary }]} numberOfLines={1}>
                  {loc.address}
                </Text>
              </RNView>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 48 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 16 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700' },
  pills: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 16 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 24 },
  pillText: { fontSize: 14, fontWeight: '600' },
  inputBox: {
    flexDirection: 'row',
    marginHorizontal: 16,
    borderWidth: 2,
    borderRadius: 12,
    padding: 14,
    gap: 12,
    marginBottom: 8,
  },
  routeDots: { alignItems: 'center', paddingTop: 6, gap: 2 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  line: { width: 2, height: 24 },
  square: { width: 8, height: 8 },
  inputs: { flex: 1, gap: 12 },
  pickup: { fontSize: 15, fontWeight: '600' },
  destInput: { fontSize: 16, padding: 0 },
  addBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  savedHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14 },
  savedTitle: { fontSize: 16, fontWeight: '700' },
  locRow: { flexDirection: 'row', paddingVertical: 14, borderBottomWidth: 1, gap: 14 },
  locLeft: { alignItems: 'center', width: 40, gap: 4 },
  distance: { fontSize: 11 },
  locText: { flex: 1, gap: 2 },
  locName: { fontSize: 15, fontWeight: '700' },
  locAddress: { fontSize: 13 },
});
