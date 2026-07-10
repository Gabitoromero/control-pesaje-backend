/**
 * Integration tests for PUT /api/lineas-produccion/:id/device.
 *
 * Follows the mockEm + supertest + JWT pattern from
 * rutas-pasadas-etapas.routes.test.ts. `device-pairing.service.ts` is em-parameterized
 * and not mocked here — it runs against the shared `mockEm`, so `assignHardwareIdToLinea`'s
 * `em.transactional(cb)` must invoke `cb(mockEm)`.
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { MikroORM } from '@mikro-orm/postgresql';
import jwt from 'jsonwebtoken';
import { initApp } from '../app.js';
import { UsuarioRol } from '../models/Usuario.js';
import * as socketIndex from '../socket/index.js';
import * as devicePairingHandler from '../socket/device-pairing.handler.js';

// ─── JWT helpers ─────────────────────────────────────────────────────────────

const JWT_SECRET = 'test-secret-key-device-route';

const makeToken = (rol: UsuarioRol, id = 1) =>
  jwt.sign({ id, nombreUsuario: 'testuser', rol }, JWT_SECRET);

const adminToken = () => makeToken(UsuarioRol.ADMINISTRADOR);
const jefeToken = () => makeToken(UsuarioRol.JEFE);
const operarioToken = () => makeToken(UsuarioRol.OPERARIO);

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
  transactional: vi.fn(async (cb: (em: unknown) => unknown) => cb(mockEm)),
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

const VALID_UUID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

describe('PUT /api/lineas-produccion/:id/device', () => {
  it('assigns hardwareId to the línea and returns it (no prior holder)', async () => {
    const target = { id: 1, nombre: 'Linea 1', hardwareId: undefined };
    mockEm.findOne
      .mockResolvedValueOnce(target) // findOne target by id
      .mockResolvedValueOnce(null); // findOne previous holder by hardwareId
    mockEm.flush.mockResolvedValue(undefined);

    const res = await request(app)
      .put('/api/lineas-produccion/1/device')
      .set('Authorization', `Bearer ${jefeToken()}`)
      .send({ hardwareId: VALID_UUID });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.hardwareId).toBe(VALID_UUID);
    expect(mockEm.transactional).toHaveBeenCalledOnce();
  });

  it('atomically reassigns hardwareId from línea A to línea B', async () => {
    const target = { id: 2, nombre: 'Linea B', hardwareId: undefined };
    const previous = { id: 1, nombre: 'Linea A', hardwareId: VALID_UUID };
    mockEm.findOne
      .mockResolvedValueOnce(target) // target by id
      .mockResolvedValueOnce(previous); // previous holder by hardwareId
    mockEm.flush.mockResolvedValue(undefined);

    const res = await request(app)
      .put('/api/lineas-produccion/2/device')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ hardwareId: VALID_UUID });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(2);
    expect(res.body.data.hardwareId).toBe(VALID_UUID);
    expect(previous.hardwareId).toBeUndefined();
    expect(mockEm.flush).toHaveBeenCalledTimes(2);
  });

  it('returns 400 when hardwareId is not a valid UUID', async () => {
    const res = await request(app)
      .put('/api/lineas-produccion/1/device')
      .set('Authorization', `Bearer ${jefeToken()}`)
      .send({ hardwareId: 'not-a-uuid' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(mockEm.transactional).not.toHaveBeenCalled();
  });

  it('returns 404 when the línea does not exist', async () => {
    mockEm.findOne.mockResolvedValueOnce(null); // target not found

    const res = await request(app)
      .put('/api/lineas-produccion/999/device')
      .set('Authorization', `Bearer ${jefeToken()}`)
      .send({ hardwareId: VALID_UUID });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 403 when the caller is not jefe/admin', async () => {
    const res = await request(app)
      .put('/api/lineas-produccion/1/device')
      .set('Authorization', `Bearer ${operarioToken()}`)
      .send({ hardwareId: VALID_UUID });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(mockEm.transactional).not.toHaveBeenCalled();
  });

  describe('hot reassignment: force-disconnect on successful reassignment', () => {
    it('calls disconnectDeviceByHardwareId with the reassigned hardwareId on success', async () => {
      const target = { id: 1, nombre: 'Linea 1', hardwareId: undefined };
      mockEm.findOne
        .mockResolvedValueOnce(target)
        .mockResolvedValueOnce(null);
      mockEm.flush.mockResolvedValue(undefined);
      const fakeIo = { fake: true };
      vi.spyOn(socketIndex, 'getIo').mockReturnValue(fakeIo as never);
      const disconnectSpy = vi
        .spyOn(devicePairingHandler, 'disconnectDeviceByHardwareId')
        .mockImplementation(() => undefined);

      const res = await request(app)
        .put('/api/lineas-produccion/1/device')
        .set('Authorization', `Bearer ${jefeToken()}`)
        .send({ hardwareId: VALID_UUID });

      expect(res.status).toBe(200);
      expect(disconnectSpy).toHaveBeenCalledWith(fakeIo, VALID_UUID);

      disconnectSpy.mockRestore();
      vi.spyOn(socketIndex, 'getIo').mockRestore();
    });

    it('still returns 200 with the updated línea when the disconnect helper throws', async () => {
      const target = { id: 1, nombre: 'Linea 1', hardwareId: undefined };
      mockEm.findOne
        .mockResolvedValueOnce(target)
        .mockResolvedValueOnce(null);
      mockEm.flush.mockResolvedValue(undefined);
      vi.spyOn(socketIndex, 'getIo').mockImplementation(() => {
        throw new Error('Socket.io not initialized');
      });

      const res = await request(app)
        .put('/api/lineas-produccion/1/device')
        .set('Authorization', `Bearer ${jefeToken()}`)
        .send({ hardwareId: VALID_UUID });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.hardwareId).toBe(VALID_UUID);

      vi.spyOn(socketIndex, 'getIo').mockRestore();
    });
  });
});
