import 'reflect-metadata';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import { initApp } from './app.js';
import { UsuarioRol } from './shared/types.js';

const JWT_SECRET = 'test-secret-key-for-api-tests';
const makeToken = (rol: UsuarioRol, id = 1) => jwt.sign({ id, nombreUsuario: 'testuser', rol }, JWT_SECRET);

const mockEm = { findAndCount: vi.fn() };

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
  app = await initApp({ em: {} } as unknown as Parameters<typeof initApp>[0]);
});

beforeEach(() => {
  vi.clearAllMocks();
  mockEm.findAndCount.mockResolvedValue([
    [
      {
        id: 1, entidad: 'articulo', entidadId: 5, raizTipo: 'articulo', raizId: 5, accion: 'editar',
        fecha: new Date('2026-11-12T10:00:00Z'), antes: { nombre: 'A' }, despues: { nombre: 'B' },
        usuario: { id: 2, nombreApellido: 'Ana', nombreUsuario: 'ana' },
      },
    ],
    1,
  ]);
});

const url = '/api/historial-cambios?raizTipo=articulo&raizId=5';

describe('GET /api/historial-cambios', () => {
  it('rejects unauthenticated requests', async () => {
    expect((await request(app).get(url)).status).toBe(401);
  });

  it.each([UsuarioRol.OPERARIO, UsuarioRol.VISUALIZACION])('forbids %s', async (rol) => {
    const res = await request(app).get(url).set('Authorization', `Bearer ${makeToken(rol)}`);
    expect(res.status).toBe(403);
    expect(mockEm.findAndCount).not.toHaveBeenCalled();
  });

  it.each([UsuarioRol.JEFE, UsuarioRol.ADMINISTRADOR])('allows %s and returns the paginated trail', async (rol) => {
    const res = await request(app).get(url).set('Authorization', `Bearer ${makeToken(rol)}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    expect(res.body.data.items[0]).toMatchObject({ accion: 'editar', antes: { nombre: 'A' }, despues: { nombre: 'B' }, usuario: { nombreUsuario: 'ana' } });
  });

  it('filters by root, user and date range and paginates', async () => {
    await request(app)
      .get(`${url}&usuarioId=2&desde=2026-11-01&hasta=2026-11-12&page=2&pageSize=10`)
      .set('Authorization', `Bearer ${makeToken(UsuarioRol.JEFE)}`);
    const [, where, opts] = mockEm.findAndCount.mock.calls[0];
    expect(where).toMatchObject({ raizTipo: 'articulo', raizId: 5, usuario: 2 });
    expect(where.fecha.$gte).toBeInstanceOf(Date);
    expect(where.fecha.$lte).toBeInstanceOf(Date);
    expect(opts).toMatchObject({ limit: 10, offset: 10 });
  });

  it('rejects an unknown raizTipo and inverted date ranges', async () => {
    const auth = { Authorization: `Bearer ${makeToken(UsuarioRol.JEFE)}` };
    expect((await request(app).get('/api/historial-cambios?raizTipo=pasada&raizId=1').set(auth)).status).toBe(400);
    expect((await request(app).get(`${url}&desde=2026-11-12&hasta=2026-11-01`).set(auth)).status).toBe(400);
  });
});
