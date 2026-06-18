import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { pool, toPublicUser, type DbUser } from '../db.js';

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
    const result = await pool.query<DbUser>('SELECT * FROM users WHERE id = $1', [payload.userId]);
    if (result.rowCount === 0) {
      res.status(401).json({ error: 'Usuário não encontrado' });
      return;
    }
    req.user = result.rows[0];
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

export function authResponse(user: DbUser) {
  return {
    token: signToken(user.id),
    user: toPublicUser(user),
  };
}
