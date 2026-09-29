/**
 * Integration tests for /api/configuracion/tolerancia.
 *
 * Follows the mockEm + supertest + JWT pattern from lineas-produccion.routes.test.ts.
 * `tolerancia-config.service.ts` is em-parameterized and runs for real against a
 * small in-memory fake of the singleton row held by `mockEm`.
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { MikroORM } from '@mikro-orm/postgresql';
import jwt from 'jsonwebtoken';
import { initApp } from '../app.js';
import { UsuarioRol } from '../models/Usuario.js';
import { ConfigSistema } from '../models/ConfigSistema.js';

const JWT_SECRET = 'test-secret-key-configuracion-route';

const makeToken = (rol: UsuarioRol, id = 1) =>
  jwt.sign({ id, nombreUsuario: 'testuser', rol }, JWT_SECRET);

const adminToken = (id = 1) => makeToken(UsuarioRol.ADMINISTRADOR, id);

interface FakeUser {
  id: number;
  nombreUsuario: string;
  nombreApellido: string;
}

interface FakeRow {
  id: number;
  toleranciaPct: number | string;
  updatedAt: Date;
  updatedByUsuario: FakeUser | null;
}

const USERS: Record<number, FakeUser> = {
  7: { id: 7, nombreUsuario: 'ana', nombreApellido: 'Ana Perez' },
  9: { id: 9, nombreUsuario: 'beto', nombreApellido: 'Beto Gomez' },
};

const T1 = new Date('2026-09-01T10:00:00Z');

let store: FakeRow | null;

const mockEm = {
  findOne: vi.fn(),
  upsert: vi.fn(),
  getReference: vi.fn(),
  populate: vi.fn(),
  flush: vi.fn(),
};

vi.mock('@mikro-orm/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@mikro-orm/core')>();
  return {
    ...original,
    RequestContext: {
      ...original.RequestContext,
      create: (_em: unknown, next: () => void) => next(),
      getEntityManager: () => mockEm,
    },
  };
});

let app: Express;

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const fakeOrm = { em: {} } as unknown as MikroORM;
  app = await initApp(fakeOrm);
});

afterAll(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.resetAllMocks();
  store = { id: 1, toleranciaPct: '20.00', updatedAt: T1, updatedByUsuario: null };
  mockEm.findOne.mockImplementation(async () => store);
  mockEm.getReference.mockImplementation((_cls: unknown, id: number) => USERS[id] ?? { id });
  mockEm.populate.mockResolvedValue(undefined);
  mockEm.flush.mockResolvedValue(undefined);
  // Fake atomic upsert: creates or overwrites the singleton row.
  mockEm.upsert.mockImplementation(async (_cls: unknown, data: FakeRow) => {
    store = { ...(store ?? {}), ...data };
    return store;
  });
});

describe('GET /api/configuracion/tolerancia', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/configuracion/tolerancia');
    expect(res.status).toBe(401);
  });

  it.each([
    UsuarioRol.OPERARIO,
    UsuarioRol.JEFE,
    UsuarioRol.ADMINISTRADOR,
    UsuarioRol.VISUALIZACION,
  ])('returns 200 with value, updatedAt and updatedBy for %s', async (rol) => {
    store = { id: 1, toleranciaPct: '20.00', updatedAt: T1, updatedByUsuario: USERS[7] };

    const res = await request(app)
      .get('/api/configuracion/tolerancia')
      .set('Authorization', `Bearer ${makeToken(rol)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: {
        toleranciaPct: 20,
        updatedAt: T1.toISOString(),
        updatedBy: { id: 7, nombreUsuario: 'ana', nombreApellido: 'Ana Perez' },
      },
    });
  });

  it('returns updatedBy null for a never-updated row', async () => {
    const res = await request(app)
      .get('/api/configuracion/tolerancia')
      .set('Authorization', `Bearer ${makeToken(UsuarioRol.OPERARIO)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.toleranciaPct).toBe(20);
    expect(res.body.data.updatedBy).toBeNull();
  });

  it('returns 404 when the row is missing (no fabricated default)', async () => {
    store = null;

    const res = await request(app)
      .get('/api/configuracion/tolerancia')
      .set('Authorization', `Bearer ${makeToken(UsuarioRol.OPERARIO)}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.data).toBeUndefined();
  });
});

describe('PUT /api/configuracion/tolerancia', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).put('/api/configuracion/tolerancia').send({ toleranciaPct: 30 });
    expect(res.status).toBe(401);
    expect(mockEm.flush).not.toHaveBeenCalled();
  });

  it.each([UsuarioRol.OPERARIO, UsuarioRol.JEFE, UsuarioRol.VISUALIZACION])(
    'returns 403 for %s and leaves the value unchanged',
    async (rol) => {
      const res = await request(app)
        .put('/api/configuracion/tolerancia')
        .set('Authorization', `Bearer ${makeToken(rol)}`)
        .send({ toleranciaPct: 30 });

      expect(res.status).toBe(403);
      expect(mockEm.flush).not.toHaveBeenCalled();
      expect(store?.toleranciaPct).toBe('20.00');
    },
  );

  it.each([
    ['negative', { toleranciaPct: -1 }],
    ['non-numeric string', { toleranciaPct: 'abc' }],
    ['numeric string', { toleranciaPct: '20' }],
    ['null', { toleranciaPct: null }],
    ['missing field', {}],
    ['above the storage bound', { toleranciaPct: 1e7 }],
    ['more than 2 decimals', { toleranciaPct: 12.345 }],
  ])('returns 400 for %s with no mutation', async (_label, body) => {
    store = { id: 1, toleranciaPct: '25.00', updatedAt: T1, updatedByUsuario: USERS[7] };

    const res = await request(app)
      .put('/api/configuracion/tolerancia')
      .set('Authorization', `Bearer ${adminToken(9)}`)
      .send(body);

    expect(res.status).toBe(400);
    expect(mockEm.flush).not.toHaveBeenCalled();
    // Rejected PUT leaves the audit columns intact.
    expect(store).toEqual({ id: 1, toleranciaPct: '25.00', updatedAt: T1, updatedByUsuario: USERS[7] });
  });

  it.each([0, 12.5, 12.35, 30, 500])(
    'returns 200 for ADMINISTRADOR with %s and binds updatedByUsuario to req.user.id',
    async (value) => {
      const res = await request(app)
        .put('/api/configuracion/tolerancia')
        .set('Authorization', `Bearer ${adminToken(7)}`)
        .send({ toleranciaPct: value });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.toleranciaPct).toBe(value);
      expect(res.body.data.updatedBy).toEqual({
        id: 7,
        nombreUsuario: 'ana',
        nombreApellido: 'Ana Perez',
      });
      expect(mockEm.getReference).toHaveBeenCalledWith(expect.anything(), 7);
      expect(mockEm.upsert).toHaveBeenCalledTimes(1);
      expect(Number(store?.toleranciaPct)).toBe(value);
    },
  );

  it('a different admin overwrites the audit info (last write wins)', async () => {
    await request(app)
      .put('/api/configuracion/tolerancia')
      .set('Authorization', `Bearer ${adminToken(7)}`)
      .send({ toleranciaPct: 25 })
      .expect(200);

    const res = await request(app)
      .put('/api/configuracion/tolerancia')
      .set('Authorization', `Bearer ${adminToken(9)}`)
      .send({ toleranciaPct: 35 });

    expect(res.status).toBe(200);
    expect(res.body.data.toleranciaPct).toBe(35);
    expect(res.body.data.updatedBy.id).toBe(9);
    expect(store?.updatedByUsuario).toEqual(USERS[9]);
  });

  it('upserts the row (id=1) when it is missing', async () => {
    store = null;

    const res = await request(app)
      .put('/api/configuracion/tolerancia')
      .set('Authorization', `Bearer ${adminToken(7)}`)
      .send({ toleranciaPct: 30 });

    expect(res.status).toBe(200);
    expect(mockEm.upsert).toHaveBeenCalledWith(ConfigSistema, expect.objectContaining({ id: 1, toleranciaPct: 30 }));
    expect(res.body.data.toleranciaPct).toBe(30);
  });
});

describe('no create/delete surface', () => {
  it.each(['post', 'delete', 'patch'] as const)('%s /api/configuracion/tolerancia is not exposed', async (method) => {
    const res = await request(app)[method]('/api/configuracion/tolerancia')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ toleranciaPct: 30 });

    expect([404, 405]).toContain(res.status);
    expect(mockEm.flush).not.toHaveBeenCalled();
  });
});
