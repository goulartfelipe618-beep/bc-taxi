import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { API_URL, type AuthResponse, type PublicUser } from '@/constants/api';

const TOKEN_KEY = 'bc_taxi_auth_token';

async function getToken() {
  if (Platform.OS === 'web') {
    return localStorage.getItem(TOKEN_KEY);
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

async function setToken(token: string | null) {
  if (Platform.OS === 'web') {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    return;
  }
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error ?? 'Erro na requisição');
  }

  return data as T;
}

export const api = {
  getToken,
  setToken,

  async register(body: {
    email: string;
    password: string;
    fullName: string;
    role: 'passenger' | 'driver';
    phone?: string;
  }) {
    const data = await request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    await setToken(data.token);
    return data;
  },

  async login(email: string, password: string) {
    const data = await request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    await setToken(data.token);
    return data;
  },

  async me() {
    return request<{ user: PublicUser }>('/auth/me');
  },

  async logout() {
    await setToken(null);
  },
};
