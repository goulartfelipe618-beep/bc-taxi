export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export type PublicUser = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: 'passenger' | 'driver';
};

export type AuthResponse = {
  token: string;
  user: PublicUser;
};
