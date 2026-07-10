import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { UsuarioRol } from '../models/Usuario.js';

export interface JWTPayload {
  id: number;
  nombreUsuario: string;
  legajo: string;
  rol: UsuarioRol;
  puedeTomarMuestrasLibres: boolean;
}

// Extend Express Request to carry the decoded JWT payload
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

export const authenticateJWT: RequestHandler = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: { message: 'Missing or invalid Authorization header' } });
    return;
  }

  const token = authHeader.slice(7);
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    res.status(500).json({ success: false, error: { message: 'JWT_SECRET not configured' } });
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as JWTPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ success: false, error: { message: 'Invalid or expired token' } });
  }
};

export const requireRoles = (roles: UsuarioRol[]): RequestHandler => {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ success: false, error: { message: 'Not authenticated' } });
      return;
    }

    if (!roles.includes(req.user.rol)) {
      res.status(403).json({ success: false, error: { message: 'Insufficient permissions' } });
      return;
    }

    next();
  };
};
