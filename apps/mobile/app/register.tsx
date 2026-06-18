import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View as RNView } from 'react-native';
import { router } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { useAuth } from '@/contexts/AuthContext';
import { useAppColors } from '@/components/useColorScheme';

export default function RegisterScreen() {
  const colors = useAppColors();
  const { register, error, clearError } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'passenger' | 'driver'>('passenger');
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    clearError();
    setLoading(true);
    const ok = await register({
      email: email.trim(),
      password,
      fullName: fullName.trim(),
      role,
    });
    setLoading(false);
    if (ok) router.replace('/(tabs)');
  }

  return (
    <View style={styles.container}>
      <Pressable onPress={() => router.replace('/login')} style={styles.back}>
        <Text style={{ fontWeight: '600' }}>← Voltar</Text>
      </Pressable>

      <Text style={styles.title}>Criar conta</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Como você quer usar o BC Taxi?</Text>

      <RNView style={styles.roleRow}>
        {(['passenger', 'driver'] as const).map((r) => {
          const selected = role === r;
          return (
            <Pressable
              key={r}
              onPress={() => setRole(r)}
              style={[
                styles.roleCard,
                {
                  borderColor: selected ? colors.buttonBg : colors.border,
                  backgroundColor: selected ? colors.selectedBg : colors.surface,
                },
              ]}>
              <Text style={styles.roleEmoji}>{r === 'passenger' ? '🧑' : '🚗'}</Text>
              <Text style={styles.roleLabel}>{r === 'passenger' ? 'Passageiro' : 'Motorista'}</Text>
            </Pressable>
          );
        })}
      </RNView>

      <RNView style={[styles.card, { backgroundColor: colors.card }]}>
        <TextInput
          value={fullName}
          onChangeText={setFullName}
          placeholder="Nome completo"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
        />
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="E-mail"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          keyboardType="email-address"
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Senha (mín. 6 caracteres)"
          placeholderTextColor={colors.textSecondary}
          secureTextEntry
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          style={[styles.button, { backgroundColor: colors.buttonBg }]}
          onPress={handleRegister}
          disabled={loading}>
          {loading ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Criar conta</Text>
          )}
        </Pressable>
      </RNView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 16 },
  back: { marginTop: 24 },
  title: { fontSize: 28, fontWeight: '800' },
  subtitle: { fontSize: 15 },
  roleRow: { flexDirection: 'row', gap: 12 },
  roleCard: { flex: 1, borderWidth: 2, borderRadius: 16, padding: 16, alignItems: 'center', gap: 8 },
  roleEmoji: { fontSize: 32 },
  roleLabel: { fontWeight: '700' },
  card: { borderRadius: 20, padding: 24, gap: 14 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16 },
  error: { color: '#E53935', fontSize: 14 },
  button: { borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  buttonText: { fontSize: 16, fontWeight: '700' },
});
