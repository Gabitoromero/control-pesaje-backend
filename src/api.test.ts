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

// ─── 4.3  Login ───────────────────────────────────────────────────────────────

describe('4.3 — Login endpoint', () => {
  it('returns JWT on valid credentials', async () => {
    const hash = await bcrypt.hash('password123', 10);
    mockEm.findOne.mockResolvedValue({
      id: 1,
      nombreUsuario: 'admin',
      rol: UsuarioRol.ADMINISTRADOR,
      activo: true,
      contrasenaHash: hash,
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ nombreUsuario: 'admin', contrasena: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.token).toBe('string');

    const decoded = jwt.verify(res.body.data.token, JWT_SECRET) as any;
    expect(decoded.rol).toBe(UsuarioRol.ADMINISTRADOR);
  });

  it('returns 401 on wrong password', async () => {
    const hash = await bcrypt.hash('correct', 10);
    mockEm.findOne.mockResolvedValue({
      id: 1,
      nombreUsuario: 'admin',
      rol: UsuarioRol.ADMINISTRADOR,
      activo: true,
      contrasenaHash: hash,
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ nombreUsuario: 'admin', contrasena: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 when user is inactive', async () => {
    const hash = await bcrypt.hash('password', 10);
    mockEm.findOne.mockResolvedValue({
      id: 1,
      nombreUsuario: 'admin',
      rol: UsuarioRol.ADMINISTRADOR,
      activo: false,
      contrasenaHash: hash,
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ nombreUsuario: 'admin', contrasena: 'password' });

    expect(res.status).toBe(401);
  });

  it('returns 401 when user does not exist', async () => {
    mockEm.findOne.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ nombreUsuario: 'nobody', contrasena: 'pass' });

    expect(res.status).toBe(401);
  });
});

// ─── 4.4  RBAC ────────────────────────────────────────────────────────────────

describe('4.4 — RBAC authorization', () => {
  it('operario cannot POST /api/articulos → 403', async () => {
    const res = await request(app)
      .post('/api/articulos')
      .set('Authorization', `Bearer ${operarioToken()}`)
      .send({ nombre: 'Helado' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('operario cannot DELETE /api/etapas/:id → 403', async () => {
    const res = await request(app)
      .delete('/api/etapas/1')
      .set('Authorization', `Bearer ${operarioToken()}`);

    expect(res.status).toBe(403);
  });

  it('operario cannot POST /api/usuarios → 403', async () => {
    const res = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${operarioToken()}`)
      .send({ nombreApellido: 'New', nombreUsuario: 'new', contrasena: 'abcd', rol: 'operario' });

    expect(res.status).toBe(403);
  });

  it('jefe can POST /api/articulos → 201 (not blocked)', async () => {
    const created = { id: 1, nombre: 'Helado', activo: true };
    mockEm.create.mockReturnValue(created);
    mockEm.flush.mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/articulos')
      .set('Authorization', `Bearer ${jefeToken()}`)
      .send({ nombre: 'Helado' });

    expect(res.status).toBe(201);
  });

  it('jefe cannot POST /api/usuarios → 403 (only administrador can)', async () => {
    const res = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${jefeToken()}`)
      .send({ nombreApellido: 'X', nombreUsuario: 'xx', contrasena: 'abcd', rol: 'operario' });

    expect(res.status).toBe(403);
  });

  it('unauthenticated request → 401', async () => {
    const res = await request(app).get('/api/articulos');
    expect(res.status).toBe(401);
  });
});

// ─── 4.5  Logical restrict ────────────────────────────────────────────────────

describe('4.5 — Logical restrict: parent deletion blocked when active refs exist', () => {
  it('DELETE /api/articulos/:id returns 400 when active RutaPasadaEtapa exists', async () => {
    // findOne returns the entity (it exists), count returns 1 (active ref)
    mockEm.findOne.mockResolvedValue({ id: 1, nombre: 'A', activo: true });
    mockEm.count.mockResolvedValue(1);

    const res = await request(app)
      .delete('/api/articulos/1')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/Cannot delete articulo/);
  });

  it('DELETE /api/articulos/:id succeeds when no active refs exist', async () => {
    mockEm.findOne.mockResolvedValue({ id: 2, nombre: 'B', activo: true });
    mockEm.count.mockResolvedValue(0);
    mockEm.flush.mockResolvedValue(undefined);

    const res = await request(app)
      .delete('/api/articulos/2')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('DELETE /api/etapas/:id returns 400 when active RutaPasadaEtapa exists', async () => {
    mockEm.findOne.mockResolvedValue({ id: 1, nombre: 'Etapa A', activo: true });
    mockEm.count.mockResolvedValue(2);

    const res = await request(app)
      .delete('/api/etapas/1')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Cannot delete etapa/);
  });

  it('DELETE /api/etapas/:id succeeds when no active refs exist', async () => {
    mockEm.findOne.mockResolvedValue({ id: 3, nombre: 'Etapa C', activo: true });
    mockEm.count.mockResolvedValue(0);
    mockEm.flush.mockResolvedValue(undefined);

    const res = await request(app)
      .delete('/api/etapas/3')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
  });

  it('DELETE /api/lineas-produccion/:id succeeds without restrict check', async () => {
    mockEm.findOne.mockResolvedValue({ id: 1, nombre: 'Linea 1', activo: true });
    mockEm.flush.mockResolvedValue(undefined);

    const res = await request(app)
      .delete('/api/lineas-produccion/1')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    // count should NOT have been called for LineaProduccion
    expect(mockEm.count).not.toHaveBeenCalled();
  });
});

describe('2FA API Endpoints', () => {
  let pin1111Hash: string;

  beforeAll(async () => {
    pin1111Hash = await bcrypt.hash('1111', 1); // low rounds for test speed
  });

  beforeEach(() => {
    sesionService.limpiar();
  });

  it('POST /api/auth/activar-sesion activates operator session successfully', async () => {
    mockEm.findOne.mockResolvedValueOnce({
      id: 5,
      rol: UsuarioRol.OPERARIO,
      activo: true,
      pinHash: pin1111Hash,
      legajo: 'OP001'
    });
    mockEm.findOne.mockResolvedValueOnce({ id: 1, nombre: 'Linea 1' });

    const res = await request(app)
      .post('/api/auth/activar-sesion')
      .set('Authorization', `Bearer ${jefeToken()}`)
      .send({ legajo: 'OP001', pin: '1111', lineaProduccionId: 1 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.usuarioIdUsuario).toBe(5);
    expect(res.body.data).not.toHaveProperty('articuloId');
  });

  it('POST /api/auth/activar-sesion returns 429 when line is blocked', async () => {
    sesionService.registrarIntentoFallido(1);
    sesionService.registrarIntentoFallido(1);
    sesionService.registrarIntentoFallido(1);
    expect(sesionService.estaBloqueada(1)).toBe(true);

    const res = await request(app)
      .post('/api/auth/activar-sesion')
      .set('Authorization', `Bearer ${jefeToken()}`)
      .send({ legajo: 'OP001', pin: '1111', lineaProduccionId: 1 });

    expect(res.status).toBe(429);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/Too many consecutive failed attempts/);
  });

  it('POST /api/auth/activar-sesion returns 404 and registers failed attempt on invalid PIN', async () => {
    mockEm.findOne.mockResolvedValueOnce(null); // no user matches the legajo

    const res = await request(app)
      .post('/api/auth/activar-sesion')
      .set('Authorization', `Bearer ${jefeToken()}`)
      .send({ legajo: 'UNKNOWN', pin: '9999', lineaProduccionId: 1 });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/No active user found with the provided PIN/);
  });

  it('POST /api/auth/activar-sesion returns 409 when operator already has session on another line', async () => {
    // Operator 5 already has an active session on line 1
    sesionService.iniciarSesion(1, 2, 5, UsuarioRol.OPERARIO);

    mockEm.findOne.mockResolvedValueOnce({ id: 5, rol: UsuarioRol.OPERARIO, activo: true, pinHash: pin1111Hash, legajo: 'OP005' });
    mockEm.findOne.mockResolvedValueOnce({ id: 2, nombre: 'Linea 2' });

    const res = await request(app)
      .post('/api/auth/activar-sesion')
      .set('Authorization', `Bearer ${jefeToken()}`)
      .send({ legajo: 'OP005', pin: '1111', lineaProduccionId: 2 });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('OPERATOR_SESSION_CONFLICT');
    expect(res.body.data.lineaProduccionId).toBe(1);
    // Original session must be untouched
    expect(sesionService.obtenerSesion(1)).toBeDefined();
    expect(sesionService.obtenerSesion(2)).toBeUndefined();
  });

  it('POST /api/auth/cerrar-sesion closes a line session', async () => {
    sesionService.iniciarSesion(1, 2, 5, UsuarioRol.OPERARIO);

    const res = await request(app)
      .post('/api/auth/cerrar-sesion')
      .set('Authorization', `Bearer ${jefeToken()}`)
      .send({ lineaProduccionId: 1 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.message).toMatch(/closed successfully/);
    expect(sesionService.obtenerSesion(1)).toBeUndefined();
  });

  it('GET /api/auth/sesion-activa/:lineaId returns null if no session', async () => {
    const res = await request(app)
      .get('/api/auth/sesion-activa/1')
      .set('Authorization', `Bearer ${jefeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeNull();
  });

  it('GET /api/auth/sesion-activa/:lineaId returns session details', async () => {
    sesionService.iniciarSesion(1, 2, 5, UsuarioRol.OPERARIO);

    const res = await request(app)
      .get('/api/auth/sesion-activa/1')
      .set('Authorization', `Bearer ${jefeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.usuarioIdGlobal).toBe(2);
    expect(res.body.data.usuarioIdUsuario).toBe(5);
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

