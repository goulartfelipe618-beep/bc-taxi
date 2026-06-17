import { ScrollView, Pressable, StyleSheet, View as RNView } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';
import { useState } from 'react';

import { Text, View } from '@/components/Themed';
import UberSearchBar from '@/components/uber/UberSearchBar';
import Colors from '@/constants/Colors';
import { HOME_SERVICES, RECENT_LOCATIONS } from '@/constants/mockData';
import { useColorScheme } from '@/components/useColorScheme';

export default function HomeScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const [activeTab, setActiveTab] = useState<'ride' | 'delivery'>('ride');

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <RNView style={styles.topTabs}>
          <Pressable style={styles.topTab} onPress={() => setActiveTab('ride')}>
            <SymbolView name={{ ios: 'car.fill', android: 'directions_car', web: 'directions_car' }} size={18} tintColor={colors.text} />
            <Text style={[styles.topTabText, activeTab === 'ride' && styles.topTabActive]}>BC Taxi</Text>
            {activeTab === 'ride' && <RNView style={styles.topTabLine} />}
          </Pressable>
          <Pressable style={styles.topTab} onPress={() => setActiveTab('delivery')}>
            <SymbolView name={{ ios: 'shippingbox.fill', android: 'local_shipping', web: 'local_shipping' }} size={18} tintColor={colors.textSecondary} />
            <Text style={[styles.topTabText, { color: colors.textSecondary }]}>Entregas</Text>
          </Pressable>
        </RNView>

        <UberSearchBar />

        <Pressable
          style={[styles.recentCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => router.push('/plan-trip')}>
          <RNView style={[styles.recentIcon, { backgroundColor: colors.card }]}>
            <SymbolView name={{ ios: 'clock.fill', android: 'schedule', web: 'schedule' }} size={18} tintColor={colors.text} />
          </RNView>
          <RNView style={styles.recentText}>
            <Text style={styles.recentName}>{RECENT_LOCATIONS[0].name}</Text>
            <Text style={[styles.recentAddress, { color: colors.textSecondary }]} numberOfLines={1}>
              {RECENT_LOCATIONS[0].address}
            </Text>
          </RNView>
          <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={16} tintColor={colors.textSecondary} />
        </Pressable>

        <RNView style={styles.promoCard}>
          <RNView style={styles.promoLeft}>
            <Text style={styles.promoTitle}>Conclua o seu pagamento de 0,68 R$</Text>
            <Pressable style={styles.promoBtn}>
              <Text style={styles.promoBtnText}>Analisar</Text>
            </Pressable>
          </RNView>
          <RNView style={styles.promoRight}>
            <SymbolView name={{ ios: 'bell.fill', android: 'notifications', web: 'notifications' }} size={40} tintColor="#FFC107" />
          </RNView>
        </RNView>

        <RNView style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Para si</Text>
          <Pressable style={[styles.sectionArrow, { backgroundColor: colors.card }]}>
            <SymbolView name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }} size={14} tintColor={colors.text} />
          </Pressable>
        </RNView>

        <RNView style={styles.serviceRow}>
          {HOME_SERVICES.map((s) => (
            <Pressable
              key={s.id}
              style={styles.serviceItem}
              onPress={() => router.push(s.id === 'ride' || s.id === 'moto' ? '/plan-trip' : '/choose-ride')}>
              <RNView style={[styles.serviceCircle, { backgroundColor: colors.card }]}>
                <SymbolView name={{ ios: 'car.fill', android: s.icon, web: s.icon }} size={24} tintColor={colors.text} />
                {'badge' in s && s.badge ? (
                  <RNView style={styles.newBadge}>
                    <Text style={styles.newBadgeText}>{s.badge}</Text>
                  </RNView>
                ) : null}
              </RNView>
              <Text style={styles.serviceLabel}>{s.label}</Text>
            </Pressable>
          ))}
        </RNView>

        <Text style={[styles.sectionTitle, styles.sectionGap]}>Poupe uma viagem</Text>
        <RNView style={[styles.saveCard, { backgroundColor: colors.card }]}>
          <Text style={styles.saveTitle}>Espere e poupe até 15%</Text>
          <Text style={[styles.saveSub, { color: colors.textSecondary }]}>Viagens flexíveis com preço menor</Text>
        </RNView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32, gap: 16 },
  topTabs: { flexDirection: 'row', gap: 24, marginBottom: 4 },
  topTab: { alignItems: 'center', gap: 4, paddingBottom: 8 },
  topTabText: { fontSize: 16, fontWeight: '600', color: '#6B6B6B' },
  topTabActive: { color: '#000', fontWeight: '800' },
  topTabLine: { position: 'absolute', bottom: 0, height: 3, width: '100%', backgroundColor: '#000', borderRadius: 2 },
  recentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  recentIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  recentText: { flex: 1 },
  recentName: { fontSize: 15, fontWeight: '700' },
  recentAddress: { fontSize: 13, marginTop: 2 },
  promoCard: {
    flexDirection: 'row',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFF9E6',
    minHeight: 100,
  },
  promoLeft: { flex: 1, padding: 16, justifyContent: 'center', gap: 10 },
  promoTitle: { fontSize: 15, fontWeight: '700' },
  promoBtn: { alignSelf: 'flex-start', backgroundColor: '#FFF', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  promoBtnText: { fontWeight: '700', fontSize: 13 },
  promoRight: { width: 100, backgroundColor: '#FFF3C4', alignItems: 'center', justifyContent: 'center' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  sectionGap: { marginTop: 8 },
  sectionArrow: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  serviceRow: { flexDirection: 'row', justifyContent: 'space-between' },
  serviceItem: { alignItems: 'center', width: 72, gap: 8 },
  serviceCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  serviceLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  newBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#E11900', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  newBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '800' },
  saveCard: { padding: 16, borderRadius: 12, gap: 4 },
  saveTitle: { fontSize: 15, fontWeight: '700' },
  saveSub: { fontSize: 13 },
});
