import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import { todasSesionesActivas, cerrarSesion } from './auth.controller.js';
import { sesionService } from '../services/sesion.service.js';
import { UsuarioRol } from '../shared/types.js';

vi.mock('../services/auth.service.js', () => {
  return {
    AuthService: class MockAuthService {
      findLineaById = vi.fn().mockResolvedValue({ nombre: 'Mock Linea' });
    }
  };
});

// Shared emit-chain mock for cerrarSesion socket assertions.
const emitMock = vi.fn();
const toMock = vi.fn().mockReturnValue({ emit: emitMock });

vi.mock('../socket/index.js', () => ({
  getIo: vi.fn(() => ({ to: toMock }) as unknown as unknown),
}));

// We need RequestContext for the ORM, but instead of complex mock,
// let's mock the RequestContext or the EntityManager.
vi.mock('@mikro-orm/core', () => {
  return {
    RequestContext: {
      getEntityManager: vi.fn().mockReturnValue({
        findOne: vi.fn().mockImplementation((entity: any, query: any) => {
          if (entity.name === 'Usuario') {
            return Promise.resolve({ nombreUsuario: 'Mock User', legajo: '123' });
          }
          if (entity.name === 'LineaProduccion') {
            return Promise.resolve({ nombre: 'Mock Linea' });
          }
          return Promise.resolve(null);
        })
      })
    }
  };
});

function makeRes() {
  const captured = { statusCode: 200, body: null as unknown };
  const mock = {
    status: vi.fn(),
    json: vi.fn(),
  };

  mock.status.mockImplementation((code: number) => {
    captured.statusCode = code;
    return mock;
  });
  mock.json.mockImplementation((body: unknown) => {
    captured.body = body;
    return mock;
  });

  return { captured, mock: mock as unknown as Response };
}

describe('auth.controller', () => {
  describe('todasSesionesActivas', () => {
    beforeEach(() => {
      sesionService.limpiar();
    });

    it('returns enriched active sessions', async () => {
      sesionService.iniciarSesion(1, 10, UsuarioRol.OPERARIO);

      const req = {} as Request;
      const { captured, mock: res } = makeRes();

      await todasSesionesActivas(req, res, vi.fn());

      expect(captured.statusCode).toBe(200);
      expect((captured.body as any).success).toBe(true);
      const data = (captured.body as any).data;
      expect(data).toHaveLength(1);
      expect(data[0].lineaId).toBe(1);
      expect(data[0].lineaNombre).toBe('Mock Linea');
      expect(data[0].usuarioId).toBe(10);
      expect(data[0].usuarioNombre).toBe('Mock User');
    });
  });

  describe('enriquecerSesiones expiraEn uses INACTIVITY_TIMEOUT_MINUTES', () => {
    const originalEnv = process.env.INACTIVITY_TIMEOUT_MINUTES;

    beforeEach(() => {
      sesionService.limpiar();
    });

    afterEach(() => {
      if (originalEnv === undefined) delete process.env.INACTIVITY_TIMEOUT_MINUTES;
      else process.env.INACTIVITY_TIMEOUT_MINUTES = originalEnv;
    });

    it('computes expiraEn as ultimaActividadAt + configured timeout (10 min)', async () => {
      process.env.INACTIVITY_TIMEOUT_MINUTES = '10';
      vi.useFakeTimers();
      const anchor = new Date('2026-06-01T12:00:00Z');
      vi.setSystemTime(anchor);

      sesionService.iniciarSesion(1, 10, UsuarioRol.OPERARIO);

      const req = {} as Request;
      const { captured } = makeRes();

      await todasSesionesActivas(req, { json: (b: unknown) => { captured.body = b; }, status: () => ({ json: (b: unknown) => { captured.body = b; } }) } as unknown as Response, vi.fn());

      const data = (captured.body as { success: boolean; data: { expiraEn: string }[] });
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
      // ultimaActividadAt = anchor; +10min → 12:10:00Z
      expect(data.data[0].expiraEn).toBe(new Date('2026-06-01T12:10:00Z').toISOString());
      vi.useRealTimers();
    });

    it('falls back to 5 minutes when env var is missing', async () => {
      delete process.env.INACTIVITY_TIMEOUT_MINUTES;
      vi.useFakeTimers();
      const anchor = new Date('2026-06-01T12:00:00Z');
      vi.setSystemTime(anchor);

      sesionService.iniciarSesion(1, 10, UsuarioRol.OPERARIO);

      const req = {} as Request;
      const { captured } = makeRes();

      await todasSesionesActivas(req, { json: (b: unknown) => { captured.body = b; }, status: () => ({ json: (b: unknown) => { captured.body = b; } }) } as unknown as Response, vi.fn());

      const data = (captured.body as { success: boolean; data: { expiraEn: string }[] });
      expect(data.data[0].expiraEn).toBe(new Date('2026-06-01T12:05:00Z').toISOString());
      vi.useRealTimers();
    });
  });

  describe('cerrarSesion emits sesion-cerrada with reason admin', () => {
    beforeEach(() => {
      sesionService.limpiar();
      emitMock.mockClear();
      toMock.mockClear();
    });

    it('emits sesion-cerrada with reason: "admin" to the line room', async () => {
      sesionService.iniciarSesion(1, 10, UsuarioRol.OPERARIO);

      const req = {
        user: { id: 1, rol: UsuarioRol.ADMINISTRADOR },
        body: { lineaProduccionId: 1 },
      } as unknown as Request;
      const { captured } = makeRes();

      await cerrarSesion(req, { json: (b: unknown) => { captured.body = b; }, status: (c: number) => { captured.statusCode = c; return { json: (b: unknown) => { captured.body = b; } }; } } as unknown as Response, vi.fn());

      expect(captured.statusCode).toBe(200);
      expect(toMock).toHaveBeenCalledWith('linea-1');
      expect(emitMock).toHaveBeenCalledWith('sesion-cerrada', {
        lineaProduccionId: 1,
        reason: 'admin',
      });
    });
  });
});
