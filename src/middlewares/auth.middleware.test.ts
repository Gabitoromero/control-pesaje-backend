import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authenticateJWT, requireRoles } from './auth.middleware.js';
import { UsuarioRol } from '../models/Usuario.js';

const JWT_SECRET = 'test-secret';

const makeReq = (authHeader?: string): Partial<Request> => ({
  headers: authHeader ? { authorization: authHeader } : {},
});

const makeRes = () => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
};

const next: NextFunction = vi.fn();

describe('authenticateJWT', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = JWT_SECRET;
  });

  it('returns 401 when Authorization header is missing', () => {
    const req = makeReq() as Request;
    const res = makeRes();
    authenticateJWT(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when token is invalid', () => {
    const req = makeReq('Bearer invalid.token.here') as Request;
    const res = makeRes();
    authenticateJWT(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next and attaches user to req when token is valid', () => {
    const payload = { id: 1, nombreUsuario: 'admin', rol: UsuarioRol.ADMINISTRADOR };
    const token = jwt.sign(payload, JWT_SECRET);
    const req = makeReq(`Bearer ${token}`) as Request;
    const res = makeRes();
    authenticateJWT(req, res, next);
    expect(next).toHaveBeenCalled();
    expect((req as any).user).toMatchObject(payload);
  });
});

describe('requireRoles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when user role is not in allowed roles', () => {
    const req = { user: { id: 1, nombreUsuario: 'op', rol: UsuarioRol.OPERARIO } } as any;
    const res = makeRes();
    requireRoles([UsuarioRol.ADMINISTRADOR])(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when user role is allowed', () => {
    const req = { user: { id: 1, nombreUsuario: 'admin', rol: UsuarioRol.ADMINISTRADOR } } as any;
    const res = makeRes();
    requireRoles([UsuarioRol.ADMINISTRADOR, UsuarioRol.JEFE])(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 401 when req.user is not set', () => {
    const req = {} as any;
    const res = makeRes();
    requireRoles([UsuarioRol.ADMINISTRADOR])(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
