import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { api } from '@/lib/api';
import type { PublicUser } from '@/constants/api';

type AuthContextValue = {
  user: PublicUser | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (input: {
    email: string;
    password: string;
    fullName: string;
    role: 'passenger' | 'driver';
  }) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await api.getToken();
        if (token) {
          const { user: me } = await api.me();
          setUser(me);
        }
      } catch {
        await api.logout();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const { user: loggedIn } = await api.login(email, password);
      setUser(loggedIn);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao entrar');
      return false;
    }
  }, []);

  const register = useCallback(
    async (input: { email: string; password: string; fullName: string; role: 'passenger' | 'driver' }) => {
      setError(null);
      try {
        const { user: created } = await api.register(input);
        setUser(created);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao criar conta');
        return false;
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo(
    () => ({ user, loading, error, login, register, logout, clearError }),
    [user, loading, error, login, register, logout, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
