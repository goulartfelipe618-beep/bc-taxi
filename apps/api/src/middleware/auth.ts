import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { pool, toPublicUser, type DbUser } from '../db.js';
import * as userStore from '../userStore.js';

export type AuthPayload = { userId: string };

declare global {
  namespace Express {
    interface Request {
      user?: DbUser;
    }
  }
}

export function signToken(userId: string) {
  return jwt.sign({ userId }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token ausente' });
    return;
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, config.jwtSecret) as AuthPayload;

    let user: DbUser | null;
    if (config.useMemoryDb) {
      user = await userStore.findUserById(payload.userId);
    } else {
      const result = await pool.query<DbUser>('SELECT * FROM users WHERE id = $1', [payload.userId]);
      user = result.rowCount ? result.rows[0] : null;
    }

    if (!user) {
      res.status(401).json({ error: 'Usuário não encontrado' });
      return;
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

export async function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next();
    return;
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, config.jwtSecret) as AuthPayload;

    let user: DbUser | null;
    if (config.useMemoryDb) {
      user = await userStore.findUserById(payload.userId);
    } else {
      const result = await pool.query<DbUser>('SELECT * FROM users WHERE id = $1', [payload.userId]);
      user = result.rowCount ? result.rows[0] : null;
    }

    if (user) req.user = user;
    next();
  } catch {
    next();
  }
}

export function authResponse(user: DbUser) {
  return {
    token: signToken(user.id),
    user: toPublicUser(user),
  };
}
