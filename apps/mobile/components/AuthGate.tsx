import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter, useSegments } from 'expo-router';

import { useAuth } from '@/contexts/AuthContext';
import { useAppColors } from '@/components/useColorScheme';

const AUTH_ROUTES = new Set(['login', 'register']);

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colors = useAppColors();

  useEffect(() => {
    if (loading) return;

    const current = segments[0] ?? '';
    const onAuthRoute = AUTH_ROUTES.has(current);

    if (!user && !onAuthRoute) {
      router.replace('/login');
    } else if (user && onAuthRoute) {
      router.replace('/(tabs)');
    }
  }, [user, loading, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    );
  }

  return <>{children}</>;
}
