import { ScrollView, Pressable, StyleSheet, View as RNView } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Text, View } from '@/components/Themed';
import ThemeSelector from '@/components/ThemeSelector';
import { ACCOUNT_MENU } from '@/constants/mockData';
import { useAppColors } from '@/components/useColorScheme';

const QUICK_ACTIONS = [
  { label: 'Ajuda', icon: 'help' as const },
  { label: 'Carteira', icon: 'account_balance_wallet' as const },
  { label: 'Segurança', icon: 'shield' as const },
  { label: 'Mensagens', icon: 'mail' as const },
];

export default function AccountScreen() {
  const colors = useAppColors();

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <RNView style={styles.header}>
          <RNView>
            <Text style={styles.name}>Felipe Goulart</Text>
            <RNView style={styles.ratingRow}>
              <SymbolView name={{ ios: 'star.fill', android: 'star', web: 'star' }} size={14} tintColor={colors.text} />
              <Text style={styles.rating}>4.93</Text>
              <RNView style={[styles.verified, { backgroundColor: colors.card }]}>
                <SymbolView name={{ ios: 'checkmark.seal.fill', android: 'verified', web: 'verified' }} size={14} tintColor={colors.accent} />
                <Text style={[styles.verifiedText, { color: colors.accent }]}>Verificado</Text>
              </RNView>
            </RNView>
          </RNView>
          <RNView style={[styles.avatar, { backgroundColor: colors.card }]}>
            <SymbolView name={{ ios: 'person.fill', android: 'person', web: 'person' }} size={32} tintColor={colors.textSecondary} />
          </RNView>
        </RNView>

        <Pressable style={[styles.accountSelector, { backgroundColor: colors.card }]}>
          <SymbolView name={{ ios: 'person.fill', android: 'person', web: 'person' }} size={18} tintColor={colors.text} />
          <Text style={styles.accountText}>Pessoal</Text>
          <SymbolView name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }} size={16} tintColor={colors.text} />
        </Pressable>

        <ThemeSelector />

        <RNView style={styles.quickGrid}>
          {QUICK_ACTIONS.map((a) => (
            <Pressable key={a.label} style={[styles.quickCard, { backgroundColor: colors.card }]}>
              <SymbolView name={{ ios: 'questionmark.circle', android: a.icon, web: a.icon }} size={24} tintColor={colors.text} />
              <Text style={styles.quickLabel}>{a.label}</Text>
            </Pressable>
          ))}
        </RNView>

        <Pressable style={[styles.promoCard, { backgroundColor: colors.card }]}>
          <RNView style={styles.promoContent}>
            <Text style={styles.promoTitle}>Poupe na sua viagem</Text>
            <Text style={[styles.promoSub, { color: colors.textSecondary }]}>Descontos exclusivos para membros</Text>
          </RNView>
          <SymbolView name={{ ios: 'leaf.fill', android: 'eco', web: 'eco' }} size={32} tintColor="#05944F" />
        </Pressable>

        {ACCOUNT_MENU.map((item) => (
          <Pressable key={item.id} style={[styles.menuItem, { borderBottomColor: colors.border }]}>
            <SymbolView name={{ ios: 'gearshape.fill', android: item.icon, web: item.icon }} size={22} tintColor={colors.text} />
            <RNView style={styles.menuText}>
              <Text style={styles.menuTitle}>{item.title}</Text>
              {'subtitle' in item && item.subtitle ? (
                <Text style={[styles.menuSub, { color: colors.textSecondary }]}>{item.subtitle}</Text>
              ) : null}
            </RNView>
            <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={16} tintColor={colors.textSecondary} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  name: { fontSize: 28, fontWeight: '800' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  rating: { fontSize: 14, fontWeight: '600' },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  verifiedText: { fontSize: 12, fontWeight: '600' },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  accountSelector: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, marginBottom: 16 },
  accountText: { flex: 1, fontSize: 16, fontWeight: '700' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  quickCard: { width: '47%', padding: 16, borderRadius: 12, gap: 10 },
  quickLabel: { fontSize: 14, fontWeight: '700' },
  promoCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, marginBottom: 16 },
  promoContent: { flex: 1, gap: 4 },
  promoTitle: { fontSize: 16, fontWeight: '700' },
  promoSub: { fontSize: 13 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, gap: 14 },
  menuText: { flex: 1, gap: 2 },
  menuTitle: { fontSize: 16, fontWeight: '700' },
  menuSub: { fontSize: 13 },
});
