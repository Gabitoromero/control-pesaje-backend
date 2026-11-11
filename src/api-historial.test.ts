import 'reflect-metadata';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import { initApp } from './app.js';
import { UsuarioRol } from './shared/types.js';
import { historialService } from './services/historial.service.js';

const JWT_SECRET = 'test-secret-key-for-api-tests';
const makeToken = (rol: UsuarioRol, id = 1) => jwt.sign({ id, nombreUsuario: 'testuser', rol }, JWT_SECRET);

const mockEm = { find: vi.fn(), findOne: vi.fn(), count: vi.fn() };

vi.mock('@mikro-orm/core', async importOriginal => {
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

const emptyResult = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  kpis: { total: 0, ok: 0, fueraRango: 0, porcentajeOk: 0, porcentajeFueraRango: 0 },
};

let app: Express;
let list: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  app = await initApp({ em: {} } as unknown as Parameters<typeof initApp>[0]);
});

beforeEach(() => {
  vi.clearAllMocks();
  list?.mockRestore();
  list = vi.spyOn(historialService, 'list').mockResolvedValue(emptyResult);
});

describe('GET /api/muestras/historial', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/muestras/historial');
    expect(res.status).toBe(401);
  });

  it.each([UsuarioRol.OPERARIO, UsuarioRol.JEFE, UsuarioRol.ADMINISTRADOR])('allows %s', async rol => {
    const res = await request(app).get('/api/muestras/historial').set('Authorization', `Bearer ${makeToken(rol)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.kpis.total).toBe(0);
  });

  it('forbids the visualizacion role', async () => {
    const res = await request(app)
      .get('/api/muestras/historial')
      .set('Authorization', `Bearer ${makeToken(UsuarioRol.VISUALIZACION)}`);
    expect(res.status).toBe(403);
    expect(list).not.toHaveBeenCalled();
  });

  it('scopes to the user in the token and ignores a usuarioId query parameter', async () => {
    await request(app)
      .get('/api/muestras/historial?usuarioId=99&usuario=99')
      .set('Authorization', `Bearer ${makeToken(UsuarioRol.OPERARIO, 7)}`);

    expect(list).toHaveBeenCalledTimes(1);
    const [, userId, filtros] = list.mock.calls[0] as unknown as [unknown, number, Record<string, unknown>];
    expect(userId).toBe(7);
    expect(filtros).not.toHaveProperty('usuarioId');
  });

  it('passes filters, search and pagination to the service with defaults', async () => {
    await request(app)
      .get('/api/muestras/historial?etapaId=3&articuloId=4&q=%20alfajor%20&desde=2026-10-01&hasta=2026-10-05&page=2&pageSize=10')
      .set('Authorization', `Bearer ${makeToken(UsuarioRol.JEFE)}`);
    await request(app).get('/api/muestras/historial').set('Authorization', `Bearer ${makeToken(UsuarioRol.JEFE)}`);

    const first = list.mock.calls[0][2] as { desde: Date; hasta: Date };
    expect(first).toMatchObject({ etapaId: 3, articuloId: 4, q: 'alfajor', page: 2, pageSize: 10 });
    expect(first.desde.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(first.hasta.toISOString()).toBe('2026-10-06T02:59:59.999Z');
    expect(list.mock.calls[1][2]).toMatchObject({ page: 1, pageSize: 20 });
  });

  it.each(['page=0', 'pageSize=101', 'etapaId=abc', 'desde=ayer', 'desde=2026-10-05&hasta=2026-10-01'])(
    'returns 400 for invalid query (%s)',
    async qs => {
      const res = await request(app)
        .get(`/api/muestras/historial?${qs}`)
        .set('Authorization', `Bearer ${makeToken(UsuarioRol.OPERARIO)}`);
      expect(res.status).toBe(400);
      expect(list).not.toHaveBeenCalled();
    },
  );

  it('keeps GET /api/muestras/:id working (route order)', async () => {
    mockEm.findOne.mockResolvedValue(null);
    const res = await request(app).get('/api/muestras/5').set('Authorization', `Bearer ${makeToken(UsuarioRol.OPERARIO)}`);
    expect(res.status).toBe(404);
    expect(list).not.toHaveBeenCalled();
  });
});
