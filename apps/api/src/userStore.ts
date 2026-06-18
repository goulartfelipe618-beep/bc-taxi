import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import type { DbUser } from './db.js';

const users = new Map<string, DbUser>();
const emailIndex = new Map<string, string>();

export async function findUserByEmail(email: string): Promise<DbUser | null> {
  const id = emailIndex.get(email);
  return id ? users.get(id) ?? null : null;
}

export async function findUserById(id: string): Promise<DbUser | null> {
  return users.get(id) ?? null;
}

export async function createUser(data: {
  email: string;
  password: string;
  fullName: string;
  role: 'passenger' | 'driver';
  phone?: string;
}): Promise<DbUser> {
  const normalizedEmail = data.email.trim().toLowerCase();
  if (emailIndex.has(normalizedEmail)) {
    throw new Error('E-mail já cadastrado');
  }

  const user: DbUser = {
    id: randomUUID(),
    email: normalizedEmail,
    password_hash: await bcrypt.hash(data.password, 12),
    full_name: data.fullName.trim(),
    phone: data.phone ?? null,
    role: data.role,
    created_at: new Date(),
  };

  users.set(user.id, user);
  emailIndex.set(normalizedEmail, user.id);
  return user;
}
