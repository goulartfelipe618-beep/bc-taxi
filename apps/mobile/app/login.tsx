import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View as RNView } from 'react-native';
import { Link, router } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { useAuth } from '@/contexts/AuthContext';
import { useAppColors } from '@/components/useColorScheme';

export default function LoginScreen() {
  const colors = useAppColors();
  const { login, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    clearError();
    setLoading(true);
    const ok = await login(email.trim(), password);
    setLoading(false);
    if (ok) router.replace('/(tabs)');
  }

  return (
    <View style={styles.container}>
      <RNView style={styles.header}>
        <Text style={styles.logo}>BC Taxi</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Mobilidade urbana na sua cidade</Text>
      </RNView>

      <RNView style={[styles.card, { backgroundColor: colors.card }]}>
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
          placeholder="Senha"
          placeholderTextColor={colors.textSecondary}
          secureTextEntry
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          style={[styles.button, { backgroundColor: colors.buttonBg }]}
          onPress={handleLogin}
          disabled={loading}>
          {loading ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Entrar</Text>
          )}
        </Pressable>
      </RNView>

      <RNView style={styles.footer}>
        <Text style={{ color: colors.textSecondary }}>Não tem conta?</Text>
        <Link href="/register" style={styles.link}>
          Criar conta
        </Link>
      </RNView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', gap: 24 },
  header: { alignItems: 'center', gap: 8 },
  logo: { fontSize: 32, fontWeight: '800' },
  subtitle: { fontSize: 15 },
  card: { borderRadius: 20, padding: 24, gap: 14 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16 },
  error: { color: '#E53935', fontSize: 14 },
  button: { borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  buttonText: { fontSize: 16, fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  link: { fontWeight: '700' },
});
