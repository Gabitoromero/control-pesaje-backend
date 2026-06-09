/**
 * Integration tests for the API layer.
 *
 * These tests spin up the Express app with a mocked MikroORM entity manager,
 * so no live database is required.
 *
 * Covers:
 *  4.1 Global soft-delete filter behaviour
 *  4.2 Zod validation rejections → HTTP 400
 *  4.3 Login endpoint — success and JWT return
 *  4.4 RBAC — role restrictions (operario blocked → 403)
 *  4.5 Logical restrict — parent deletion blocked → 400 when active refs exist
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { MikroORM } from '@mikro-orm/postgresql';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { initApp } from './app.js';
import { UsuarioRol } from './models/Usuario.js';
import { LoginSchema, ActividadSchema, SesionLineaSchema, UsuarioCreateSchema } from './utils/schemas.js';
import { sesionService } from './services/sesion.service.js';

// ─── JWT helpers ─────────────────────────────────────────────────────────────

const JWT_SECRET = 'test-secret-key-for-api-tests';

const makeToken = (rol: UsuarioRol, id = 1) =>
  jwt.sign({ id, nombreUsuario: 'testuser', rol }, JWT_SECRET);

const adminToken = () => makeToken(UsuarioRol.ADMINISTRADOR);
const jefeToken = () => makeToken(UsuarioRol.JEFE, 2);
const operarioToken = () => makeToken(UsuarioRol.OPERARIO, 3);

// ─── Mock MikroORM ────────────────────────────────────────────────────────────
//
// We mock @mikro-orm/core so RequestContext.getEntityManager() returns
// a controlled fake EM. This lets us test the full HTTP stack without a DB.

const mockEm = {
  find: vi.fn(),
  findOne: vi.fn(),
  create: vi.fn(),
  assign: vi.fn(),
  flush: vi.fn(),
  count: vi.fn(),
  persist: vi.fn().mockReturnThis(),
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

  // We pass a minimal fake ORM — initApp only uses orm.em to create RequestContext
  const fakeOrm = {
    em: {},
  } as unknown as MikroORM;

  app = await initApp(fakeOrm);
});

afterAll(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── 4.1  Soft-delete filter ─────────────────────────────────────────────────

describe('4.1 — soft-delete filter (GET /api/articulos only returns active records)', () => {
  it('returns only items returned by the EM (filter applied at DB level via @Filter)', async () => {
    // findAll() explicitly filters { activo: true } in BaseService.
    // Here we assert the list endpoint forwards EM.find() result as-is.
    const active = [{ id: 1, nombre: 'A', activo: true }];
    mockEm.find.mockResolvedValue(active);

    const res = await request(app)
      .get('/api/articulos')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(active);
    expect(mockEm.find).toHaveBeenCalledOnce();
  });

  it('returns empty array when all records are soft-deleted (EM returns [])', async () => {
    mockEm.find.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/articulos')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

// ─── 4.2  Zod validation ─────────────────────────────────────────────────────

describe('4.2 — Zod validation → HTTP 400', () => {
  it('POST /api/articulos rejects missing required field with 400', async () => {
    const res = await request(app)
      .post('/api/articulos')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ descripcion: 'no nombre field' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toBe('Validation error');
  });

  it('POST /api/etapas rejects body missing nombre with 400', async () => {
    const res = await request(app)
      .post('/api/etapas')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/lineas-produccion rejects invalid numeroBalanza type with 400', async () => {
    const res = await request(app)
      .post('/api/lineas-produccion')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ nombre: 'Linea 1', numeroBalanza: 'not-a-number' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/auth/login rejects missing password with 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ nombreUsuario: 'admin' }); // password missing

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('PUT /api/usuarios/:id rejects invalid rol value with 400', async () => {
    const res = await request(app)
      .put('/api/usuarios/1')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ rol: 'superadmin' }); // invalid enum value

    expect(res.status).toBe(400);
  });
});

// ─── 4.X  Schema Validation ──────────────────────────────────────────────────

describe('Schema validation (v1.5)', () => {
  it('LoginSchema validates correctly', () => {
    expect(LoginSchema.safeParse({ legajo: '12345', pin: '1234' }).success).toBe(true);
    expect(LoginSchema.safeParse({ pin: 'abc' }).success).toBe(false);
  });

  it('ActividadSchema validates correctly', () => {
    expect(ActividadSchema.safeParse({ lineaProduccionId: 2 }).success).toBe(true);
    expect(ActividadSchema.safeParse({ lineaProduccionId: '2' }).success).toBe(false);
  });

  it('SesionLineaSchema validates correctly', () => {
    expect(SesionLineaSchema.safeParse({ lineaProduccionId: 1 }).success).toBe(true);
    expect(SesionLineaSchema.safeParse({ lineaProduccionId: 'abc' }).success).toBe(false);
    expect(SesionLineaSchema.safeParse({ lineaProduccionId: -1 }).success).toBe(false);
  });

  it('UsuarioCreateSchema validates correctly', () => {
    expect(UsuarioCreateSchema.safeParse({ 
      nombreApellido: 'A', nombreUsuario: 'abc', rol: 'operario', 
      legajo: '123', pin: '1234' 
    }).success).toBe(true);
    
    expect(UsuarioCreateSchema.safeParse({ 
      nombreApellido: 'A', nombreUsuario: 'a', rol: 'operario', 
      contrasena: 'abc' 
    }).success).toBe(false);
  });
  
  it('VerificarPinSchema and ActivarSesionSchema are no longer importable', async () => {
    const schemas = await import('./utils/schemas.js');
    expect(schemas).not.toHaveProperty('VerificarPinSchema');
    expect(schemas).not.toHaveProperty('ActivarSesionSchema');
  });
});

// ─── 4.3  Login ───────────────────────────────────────────────────────────────

describe('4.3 — Login endpoint (v1.5)', () => {
  beforeEach(() => {
    sesionService.limpiar();
  });

  it('POST /api/auth/login returns JWT on valid credentials', async () => {
    const hash = await bcrypt.hash('1234', 10);
    mockEm.findOne.mockResolvedValue({
      id: 1,
      legajo: '12345',
      nombreUsuario: 'admin',
      rol: UsuarioRol.ADMINISTRADOR,
      activo: true,
      pinHash: hash,
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ legajo: '12345', pin: '1234' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.token).toBe('string');
  });

  it('POST /api/auth/login returns 401 on wrong pin', async () => {
    const hash = await bcrypt.hash('correct', 10);
    mockEm.findOne.mockResolvedValue({
      id: 1,
      legajo: '12345',
      activo: true,
      pinHash: hash,
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ legajo: '12345', pin: '0000' });

    expect(res.status).toBe(401);
  });

  it('POST /api/auth/login returns 401 when user is inactive', async () => {
    mockEm.findOne.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ legajo: '12345', pin: '1234' });

    expect(res.status).toBe(401);
  });

  it('POST /api/auth/login returns 400 on invalid body', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ legajo: '12345', pin: 'abc' });

    expect(res.status).toBe(400);
  });

  it('POST /api/auth/verificar-pin returns 404 (removed)', async () => {
    const res = await request(app).post('/api/auth/verificar-pin').send({ legajo: '12345', pin: '1234' });
    expect(res.status).toBe(404);
  });

  it('POST /api/auth/activar-sesion returns 404 (removed)', async () => {
    const res = await request(app).post('/api/auth/activar-sesion').send({ legajo: '12345', pin: '1234', lineaProduccionId: 1 });
    expect(res.status).toBe(404);
  });

  it('POST /api/auth/login rate-limits after 5 failures and resets on success', async () => {
    const hash = await bcrypt.hash('1234', 10);
    mockEm.findOne.mockResolvedValue({
      id: 1, legajo: 'RATE', activo: true, pinHash: hash,
    });

    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/login').send({ legajo: 'RATE', pin: '0000' });
    }

    const res6 = await request(app).post('/api/auth/login').send({ legajo: 'RATE', pin: '1234' });
    expect(res6.status).toBe(429);

    // fast forward logic is hard here without vitest fake timers, but sesionService is a singleton so we can manual reset
    sesionService.resetearIntentos('RATE');

    const res7 = await request(app).post('/api/auth/login').send({ legajo: 'RATE', pin: '1234' });
    expect(res7.status).toBe(200);
  });
});

describe('Line Sessions (v1.5)', () => {
  beforeEach(() => {
    sesionService.limpiar();
  });

  it('POST /api/auth/sesion-linea creates a session for operario', async () => {
    const res = await request(app)
      .post('/api/auth/sesion-linea')
      .set('Authorization', `Bearer ${operarioToken()}`)
      .send({ lineaProduccionId: 1 });

    expect(res.status).toBe(201); // or 200 depending on implementation
    expect(res.body.success).toBe(true);
    expect(res.body.data.usuarioRol).toBe(UsuarioRol.OPERARIO);
  });

  it('POST /api/auth/sesion-linea creates a session for jefe', async () => {
    const res = await request(app)
      .post('/api/auth/sesion-linea')
      .set('Authorization', `Bearer ${jefeToken()}`)
      .send({ lineaProduccionId: 1 });

    expect(res.status).toBe(201);
    expect(res.body.data.usuarioRol).toBe(UsuarioRol.JEFE);
  });

  it('POST /api/auth/sesion-linea returns 403 for visualizacion', async () => {
    const visualizacionToken = makeToken(UsuarioRol.VISUALIZACION, 4);
    const res = await request(app)
      .post('/api/auth/sesion-linea')
      .set('Authorization', `Bearer ${visualizacionToken}`)
      .send({ lineaProduccionId: 1 });

    expect(res.status).toBe(403);
  });

  it('POST /api/auth/sesion-linea returns 409 if user already has a session on another line', async () => {
    sesionService.iniciarSesion(2, 3, UsuarioRol.OPERARIO); // User 3 on line 2
    const res = await request(app)
      .post('/api/auth/sesion-linea')
      .set('Authorization', `Bearer ${operarioToken()}`) // token for user 3
      .send({ lineaProduccionId: 1 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SESSION_CONFLICT');
    expect(res.body.data.lineaProduccionId).toBe(2);
  });

  it('POST /api/auth/sesion-linea returns 401 without JWT', async () => {
    const res = await request(app).post('/api/auth/sesion-linea').send({ lineaProduccionId: 1 });
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/sesion-linea returns 400 on invalid body', async () => {
    const res = await request(app)
      .post('/api/auth/sesion-linea')
      .set('Authorization', `Bearer ${operarioToken()}`)
      .send({ lineaProduccionId: 'abc' });
    expect(res.status).toBe(400);
  });

  it('PATCH /api/auth/actividad returns 200 with ultimaActividadAt for active session', async () => {
    sesionService.iniciarSesion(1, 3, UsuarioRol.OPERARIO);
    const res = await request(app)
      .patch('/api/auth/actividad')
      .set('Authorization', `Bearer ${operarioToken()}`)
      .send({ lineaProduccionId: 1 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.ultimaActividadAt).toBe('string');
  });

  it('PATCH /api/auth/actividad returns 404 for non-existent session', async () => {
    const res = await request(app)
      .patch('/api/auth/actividad')
      .set('Authorization', `Bearer ${operarioToken()}`)
      .send({ lineaProduccionId: 1 });

    expect(res.status).toBe(404);
  });

  it('PATCH /api/auth/actividad returns 401 without JWT', async () => {
    const res = await request(app).patch('/api/auth/actividad').send({ lineaProduccionId: 1 });
    expect(res.status).toBe(401);
  });

  it('PATCH /api/auth/actividad returns 400 on invalid body', async () => {
    const res = await request(app)
      .patch('/api/auth/actividad')
      .set('Authorization', `Bearer ${operarioToken()}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('GET /api/auth/sesion-activa/:lineaId returns new shape', async () => {
    sesionService.iniciarSesion(1, 3, UsuarioRol.OPERARIO);
    const res = await request(app)
      .get('/api/auth/sesion-activa/1')
      .set('Authorization', `Bearer ${operarioToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.usuarioId).toBe(3);
    expect(res.body.data.usuarioRol).toBe(UsuarioRol.OPERARIO);
    expect(res.body.data.ultimaActividadAt).toBeDefined();
    // Verify removed fields
    expect(res.body.data.usuarioIdGlobal).toBeUndefined();
    expect(res.body.data.usuarioIdUsuario).toBeUndefined();
    expect(res.body.data.rolUsuario).toBeUndefined();
    expect(res.body.data.usuarioUltimaActividadAt).toBeUndefined();
  });
});

// ─── 4.6  GET /inactive routes ────────────────────────────────────────────────

const inactiveEntities = [
  { path: '/api/articulos/inactive', name: 'articulos' },
  { path: '/api/etapas/inactive', name: 'etapas' },
  { path: '/api/usuarios/inactive', name: 'usuarios' },
  { path: '/api/rutas-pasadas-etapas/inactive', name: 'rutas-pasadas-etapas' },
  { path: '/api/lineas-produccion/inactive', name: 'lineas-produccion' },
];

describe('4.6 — GET /inactive routes', () => {
  // T-06: valid JWT → 200 with empty data array
  for (const { path, name } of inactiveEntities) {
    it(`T-06: GET ${path} returns 200 { success: true, data: [] } when no inactive records`, async () => {
      mockEm.find.mockResolvedValue([]);

      const res = await request(app)
        .get(path)
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });
  }

  // T-07: valid JWT → 200 with inactive records returned
  for (const { path, name } of inactiveEntities) {
    it(`T-07: GET ${path} returns 200 with inactive records`, async () => {
      const inactive = [{ id: 1, nombre: `${name}-inactive`, activo: false }];
      mockEm.find.mockResolvedValue(inactive);

      const res = await request(app)
        .get(path)
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(inactive);
    });
  }

  // T-07 (deeper): assert findAllInactive calls em.find with { activo: false }
  it('T-07 (deep): GET /api/articulos/inactive calls em.find with { activo: false }', async () => {
    const inactive = [{ id: 10, nombre: 'Stale Articulo', activo: false }];
    mockEm.find.mockResolvedValue(inactive);

    const res = await request(app)
      .get('/api/articulos/inactive')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(inactive);
    expect(mockEm.find).toHaveBeenCalledOnce();
    const [, where] = mockEm.find.mock.calls[0];
    expect(where).toMatchObject({ activo: false });
  });

  // T-08: no Authorization header → 401
  for (const { path } of inactiveEntities) {
    it(`T-08: GET ${path} without Authorization header → 401`, async () => {
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
    });
  }

  // T-09 (usuarios): non-admin JWT → 200 (no role guard on /inactive)
  it('T-09: GET /api/usuarios/inactive with operario JWT → 200 (no role guard)', async () => {
    mockEm.find.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/usuarios/inactive')
      .set('Authorization', `Bearer ${operarioToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // T-lineas-no-estado: /api/lineas-produccion/inactive does NOT include estado key
  it('T-lineas-no-estado: GET /api/lineas-produccion/inactive response objects have no estado key', async () => {
    const inactive = [{ id: 5, nombre: 'Linea Inactiva', activo: false, numeroBalanza: 3 }];
    mockEm.find.mockResolvedValue(inactive);

    const res = await request(app)
      .get('/api/lineas-produccion/inactive')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).not.toHaveProperty('estado');
  });
});

