import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';

export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const key = req.header('x-admin-key') ?? req.header('X-Admin-Key');
  if (!config.adminApiKey) {
    res.status(503).json({ error: 'Admin API não configurada (ADMIN_API_KEY)' });
    return;
  }
  if (key !== config.adminApiKey) {
    res.status(401).json({ error: 'Chave admin inválida' });
    return;
  }
  next();
}
