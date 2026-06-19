import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config } from '../config.js';
import { pool, toPublicUser } from '../db.js';
import { authMiddleware, authResponse } from '../middleware/auth.js';
import * as userStore from '../userStore.js';

const registerSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  fullName: z.string().min(2, 'Nome muito curto'),
  role: z.enum(['passenger', 'driver']),
  phone: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Senha obrigatória'),
});

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Dados inválidos' });
    return;
  }

  const { email, password, fullName, role, phone } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  try {
    if (config.useMemoryDb) {
      const existing = await userStore.findUserByEmail(normalizedEmail);
      if (existing) {
        res.status(409).json({ error: 'E-mail já cadastrado' });
        return;
      }
      const user = await userStore.createUser({ email: normalizedEmail, password, fullName, role, phone });
      res.status(201).json(authResponse(user));
      return;
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rowCount && existing.rowCount > 0) {
      res.status(409).json({ error: 'E-mail já cadastrado' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, phone, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [normalizedEmail, passwordHash, fullName.trim(), phone ?? null, role],
    );

    const user = result.rows[0];
    if (role === 'driver') {
      await pool.query(
        `INSERT INTO drivers (user_id, enabled_categories) VALUES ($1, ARRAY['economico','comfort'])
         ON CONFLICT (user_id) DO NOTHING`,
        [user.id],
      );
    }

    res.status(201).json(authResponse(user));
  } catch (err) {
    console.error('register error', err);
    res.status(500).json({ error: 'Erro ao criar conta' });
  }
});

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Dados inválidos' });
    return;
  }

  const { email, password } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  try {
    let user;

    if (config.useMemoryDb) {
      user = await userStore.findUserByEmail(normalizedEmail);
      if (!user) {
        res.status(401).json({ error: 'E-mail ou senha inválidos' });
        return;
      }
    } else {
      const result = await pool.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
      if (result.rowCount === 0) {
        res.status(401).json({ error: 'E-mail ou senha inválidos' });
        return;
      }
      user = result.rows[0];
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'E-mail ou senha inválidos' });
      return;
    }

    res.json(authResponse(user));
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ error: 'Erro ao entrar' });
  }
});

authRouter.get('/me', authMiddleware, (req, res) => {
  res.json({ user: toPublicUser(req.user!) });
});
