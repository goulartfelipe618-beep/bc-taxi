import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';

import Colors from '@/constants/Colors';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedScheme = 'light' | 'dark';

const STORAGE_KEY = '@bc-taxi/theme-preference';

type ThemeContextValue = {
  preference: ThemePreference;
  colorScheme: ResolvedScheme;
  colors: (typeof Colors)['light'];
  setPreference: (pref: ThemePreference) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useSystemColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (value === 'light' || value === 'dark' || value === 'system') {
        setPreferenceState(value);
      }
    });
  }, []);

  const setPreference = useCallback((pref: ThemePreference) => {
    setPreferenceState(pref);
    AsyncStorage.setItem(STORAGE_KEY, pref);
  }, []);

  const colorScheme: ResolvedScheme = useMemo(() => {
    if (preference === 'system') {
      return systemScheme === 'dark' ? 'dark' : 'light';
    }
    return preference;
  }, [preference, systemScheme]);

  const toggleTheme = useCallback(() => {
    setPreference(colorScheme === 'dark' ? 'light' : 'dark');
  }, [colorScheme, setPreference]);

  const value = useMemo(
    () => ({
      preference,
      colorScheme,
      colors: Colors[colorScheme],
      setPreference,
      toggleTheme,
    }),
    [preference, colorScheme, setPreference, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

export function useAppColors() {
  return useTheme().colors;
}

export function useColorScheme(): ResolvedScheme {
  return useTheme().colorScheme;
}
