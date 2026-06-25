/**
 * Integration tests for /api/rutas-pasadas-etapas route.
 *
 * After the pivot hard-delete refactor:
 * - GET /    → returns ALL pivot records (no activo filter)
 * - GET /:id → returns one by id
 * - POST /   → creates pivot record (no activo in payload)
 * - DELETE /:id → hard-deletes (physical removal)
 * - GET /inactive → 404 (endpoint no longer registered)
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { MikroORM } from '@mikro-orm/postgresql';
import jwt from 'jsonwebtoken';
import { initApp } from '../app.js';
import { UsuarioRol } from '../models/Usuario.js';

// ─── JWT helpers ─────────────────────────────────────────────────────────────

const JWT_SECRET = 'test-secret-key-pivot-route';

const makeToken = (rol: UsuarioRol, id = 1) =>
  jwt.sign({ id, nombreUsuario: 'testuser', rol }, JWT_SECRET);

const adminToken = () => makeToken(UsuarioRol.ADMINISTRADOR);

// ─── Mock EntityManager ───────────────────────────────────────────────────────

const mockEm = {
  find: vi.fn(),
  findOne: vi.fn(),
  create: vi.fn(),
  assign: vi.fn(),
  flush: vi.fn(),
  count: vi.fn(),
  persist: vi.fn().mockReturnThis(),
  remove: vi.fn().mockReturnThis(),
  transactional: vi.fn(async (cb: (em: any) => any) => cb(mockEm)),
};

vi.mock('@mikro-orm/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@mikro-orm/core')>();
  return {
    ...original,
    RequestContext: {
      ...original.RequestContext,
      create: (_em: any, next: () => void) => next(),
      getEntityManager: () => mockEm,
    },
  };
});

// ─── App bootstrap ────────────────────────────────────────────────────────────

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
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/rutas-pasadas-etapas', () => {
  it('returns all pivot records (no activo filter)', async () => {
    const pivots = [
      { id: 1, orden: 1, etapa: { id: 2, nombre: 'Envasado' } },
      { id: 2, orden: 2, etapa: { id: 3, nombre: 'Control Peso' } },
    ];
    mockEm.find.mockResolvedValue(pivots);

    const res = await request(app)
      .get('/api/rutas-pasadas-etapas')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
  });

  it('filters by rutaPasadaId query param without activo filter', async () => {
    mockEm.find.mockResolvedValue([{ id: 1, orden: 1 }]);

    const res = await request(app)
      .get('/api/rutas-pasadas-etapas?rutaPasadaId=5')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // The em.find must not receive activo in where clause
    expect(mockEm.find).toHaveBeenCalledOnce();
    const [, where] = mockEm.find.mock.calls[0];
    expect(where).not.toHaveProperty('activo');
  });
});

describe('POST /api/rutas-pasadas-etapas', () => {
  it('creates a pivot record — payload has no activo field accepted', async () => {
    const payload = {
      rutaPasada: 1,
      etapa: 2,
      orden: 1,
      pesoIdeal: 70,
      pesoMinimo: 65,
      pesoMaximo: 75,
      cantidadMuestrasRequeridas: 3,
    };
    const created = { id: 1, ...payload };
    mockEm.create.mockReturnValue(created);
    mockEm.flush.mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/rutas-pasadas-etapas')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    // create must not have been called with activo in the data
    expect(mockEm.create).toHaveBeenCalledOnce();
    const [, data] = mockEm.create.mock.calls[0];
    expect(data).not.toHaveProperty('activo');
  });
});

describe('DELETE /api/rutas-pasadas-etapas/:id', () => {
  it('hard-deletes the pivot record via em.remove + flush', async () => {
    const pivot = { id: 7, orden: 1 };
    mockEm.findOne.mockResolvedValue(pivot);
    mockEm.flush.mockResolvedValue(undefined);

    const res = await request(app)
      .delete('/api/rutas-pasadas-etapas/7')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockEm.remove).toHaveBeenCalledWith(pivot);
    expect(mockEm.flush).toHaveBeenCalled();
  });

  it('returns 404 when record not found', async () => {
    mockEm.findOne.mockResolvedValue(null);

    const res = await request(app)
      .delete('/api/rutas-pasadas-etapas/999')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/rutas-pasadas-etapas/inactive', () => {
  it('returns 404 — /inactive matches GET /:id with id=NaN, findOne returns null', async () => {
    // The path "/inactive" matches GET /:id; Number("inactive") = NaN; findOne returns null → 404
    mockEm.findOne.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/rutas-pasadas-etapas/inactive')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(404);
  });
});
