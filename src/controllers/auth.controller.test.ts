import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { todasSesionesActivas } from './auth.controller.js';
import { sesionService } from '../services/sesion.service.js';
import { UsuarioRol } from '../shared/types.js';

vi.mock('../services/auth.service.js', () => {
  return {
    AuthService: class MockAuthService {
      findLineaById = vi.fn().mockResolvedValue({ nombre: 'Mock Linea' });
    }
  };
});

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
});
