import 'reflect-metadata';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initApp } from './app.js';
import { UsuarioRol } from './models/Usuario.js';
import jwt from 'jsonwebtoken';
import { PasadaEstado } from './models/Pasada.js';

const JWT_SECRET = 'test-secret-key-for-api-tests';
const makeToken = (rol: UsuarioRol, id = 1) =>
  jwt.sign({ id, nombreUsuario: 'testuser', rol }, JWT_SECRET);
const adminToken = () => makeToken(UsuarioRol.ADMINISTRADOR);

const mockEm = {
  find: vi.fn(),
  findOne: vi.fn(),
  count: vi.fn(),
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

let app: Express;

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const fakeOrm = { em: {} } as any;
  app = await initApp(fakeOrm);
});

afterAll(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Dashboard Integration Tests', () => {
  describe('GET /api/dashboard/lineas', () => {
    it('returns lineas with rutaPasadaActiva', async () => {
      mockEm.find.mockResolvedValue([
        { id: 1, nombre: 'Linea 1', rutaPasadaActiva: { id: 10, nombre: 'Ruta 10' } }
      ]);
      const res = await request(app)
        .get('/api/dashboard/lineas')
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data[0].rutaPasadaActiva.nombre).toBe('Ruta 10');
    });
  });

  describe('GET /api/dashboard/:lineaId/resumen', () => {
    it('returns 404 when no active ruta', async () => {
      mockEm.findOne.mockResolvedValueOnce(null); // LineaProduccion
      const res = await request(app)
        .get('/api/dashboard/1/resumen')
        .set('Authorization', `Bearer ${adminToken()}`);
      expect(res.status).toBe(404);
    });

    it('returns 200 and calculcates tiempoDesdeRuta when no active pasada', async () => {
      const now = new Date();
      const rutaAsignadaAt = new Date(now.getTime() - 120000); // 2 minutes ago
      mockEm.findOne.mockResolvedValueOnce({ id: 1, rutaPasadaActiva: { id: 10 }, rutaAsignadaAt }); // LineaProduccion
      mockEm.findOne.mockResolvedValueOnce(null); // Pasada

      const res = await request(app)
        .get('/api/dashboard/1/resumen')
        .set('Authorization', `Bearer ${adminToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.data.tiempoDesdeRuta).toBeGreaterThanOrEqual(119000);
      expect(res.body.data.pasadaEnCurso).toBeNull();
    });

    it('returns active pasada and calculated tiempoTranscurrido and tiempoDesdeRuta', async () => {
      const now = new Date();
      const rutaAsignadaAt = new Date(now.getTime() - 120000); // 2 minutes ago
      const horaInicio = new Date(now.getTime() - 60000); // 1 minute ago
      mockEm.findOne.mockResolvedValueOnce({ id: 1, rutaPasadaActiva: { id: 10 }, rutaAsignadaAt }); // LineaProduccion
      mockEm.findOne.mockResolvedValueOnce({
        id: 5,
        estado: PasadaEstado.EN_CURSO,
        horaInicio,
      }); // Pasada
      const res = await request(app)
        .get('/api/dashboard/1/resumen')
        .set('Authorization', `Bearer ${adminToken()}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.tiempoDesdeRuta).toBeGreaterThanOrEqual(119000);
      expect(res.body.data.pasadaEnCurso).toBeDefined();
      expect(res.body.data.pasadaEnCurso.id).toBe(5);
      expect(res.body.data.pasadaEnCurso.tiempoTranscurrido).toBeGreaterThanOrEqual(59000); // approx 60000 ms
    });
  });

  describe('GET /api/dashboard/:lineaId/kpis', () => {
    it('returns kpis for the line based on today samples', async () => {
      mockEm.findOne.mockResolvedValueOnce({ id: 1, rutaAsignadaAt: new Date(), rutaPasadaActiva: { id: 1 } });
      mockEm.find.mockResolvedValue([
        { id: 1, etapa: { id: 1 }, pesoNeto: 100, estadoValidacion: 'ok', timestamp: new Date() },
        { id: 2, etapa: { id: 1 }, pesoNeto: 85,  estadoValidacion: 'fuera_de_rango', timestamp: new Date() },
      ]);
      mockEm.count.mockResolvedValue(3);
      const res = await request(app)
        .get('/api/dashboard/1/kpis')
        .set('Authorization', `Bearer ${adminToken()}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.muestrasTotales).toBe(2);
      expect(res.body.data.fueraRango).toBe(1);
    });
  });

  describe('GET /api/dashboard/:lineaId/etapas', () => {
    it('returns etapas with aggregated data', async () => {
      mockEm.findOne.mockResolvedValue({ id: 1, rutaAsignadaAt: new Date(), rutaPasadaActiva: { id: 10 } });
      mockEm.find.mockResolvedValueOnce([
        {
          pesoNeto: 100,
          timestamp: new Date(),
          estadoValidacion: 'ok',
          etapa: { id: 1, nombre: 'Etapa 1' },
          pasada: { id: 42 }
        }
      ]); // mock muestras
      mockEm.find.mockResolvedValueOnce([
        {
          etapa: { id: 1, nombre: 'Etapa 1' },
          pesoMinimo: 90, pesoMaximo: 110, pesoIdeal: 100
        }
      ]); // mock configEtapas
      const res = await request(app)
        .get('/api/dashboard/1/etapas')
        .set('Authorization', `Bearer ${adminToken()}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].ultimoPeso).toBe(100);
      expect(res.body.data[0].porcentajeConforme).toBe(100);
      expect(res.body.data[0].muestrasConformes).toBe(1);
      expect(res.body.data[0].muestrasFueraRango).toBe(0);
      expect(res.body.data[0].muestrasTotales).toBe(1);
      expect(res.body.data[0].timeSeries.length).toBe(1);
      expect(res.body.data[0].timeSeries[0].pasadaId).toBe(42);
      expect(res.body.data[0].timeSeries[0].estadoValidacion).toBe('ok');
    });

    it('handles edge case where active linea has no samples yet', async () => {
      mockEm.findOne.mockResolvedValue({ id: 1, rutaAsignadaAt: new Date(), rutaPasadaActiva: { id: 10 } });
      mockEm.find.mockResolvedValueOnce([]); // empty muestras
      mockEm.find.mockResolvedValueOnce([
        {
          etapa: { id: 1, nombre: 'Etapa 1' },
          pesoMinimo: 90, pesoMaximo: 110, pesoIdeal: 100
        }
      ]); // mock configEtapas

      const res = await request(app)
        .get('/api/dashboard/1/etapas')
        .set('Authorization', `Bearer ${adminToken()}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].ultimoPeso).toBe(0);
      expect(res.body.data[0].porcentajeConforme).toBe(0);
      expect(res.body.data[0].muestrasConformes).toBe(0);
      expect(res.body.data[0].muestrasFueraRango).toBe(0);
      expect(res.body.data[0].muestrasTotales).toBe(0);
      expect(res.body.data[0].timeSeries.length).toBe(0);
    });
  });
});
