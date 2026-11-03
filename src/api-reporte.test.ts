import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const auth = vi.hoisted(() => ({ rejectAll: false }));

// Mock the controller directly to avoid depending on @mikro-orm/core in this test
vi.mock('./controllers/reporte.controller.js', () => ({
  getReporteMuestras: vi.fn((req: any, res: any) => {
    res
      .setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .send(Buffer.from('fake-excel-data'));
  }),
  getReportePasadas: vi.fn((req: any, res: any) => {
    res
      .setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .send(Buffer.from('fake-excel-data'));
  }),
  getReporteRutasPasada: vi.fn((req: any, res: any) => {
    res
      .setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .send(Buffer.from('fake-excel-data'));
  }),
}));

vi.mock('./middlewares/auth.middleware.js', () => ({
  authenticateJWT: (_req: any, res: any, next: any) =>
    auth.rejectAll ? res.status(401).json({ success: false }) : next(),
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

import reportesRoutes from './routes/reportes.routes.js';
import { getReporteMuestras, getReportePasadas, getReporteRutasPasada } from './controllers/reporte.controller.js';

const app = express();
app.use('/api/reportes', reportesRoutes);

describe('API Reportes Integration', () => {
  beforeEach(() => {
    auth.rejectAll = false;
    vi.mocked(getReporteRutasPasada).mockClear();
  });

  it.each([
    ['muestras', getReporteMuestras],
    ['pasadas', getReportePasadas],
  ] as const)('GET /api/reportes/%s returns 200 and correct content-type', async (path, handler) => {
    const response = await request(app)
      .get(`/api/reportes/${path}`)
      .query({ desde: '2023-01-01', hasta: '2023-01-05' });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(handler).toHaveBeenCalled();
  });

  it.each(['muestras', 'pasadas'])('GET /api/reportes/%s returns 401 without auth', async (path) => {
    auth.rejectAll = true;
    const response = await request(app).get(`/api/reportes/${path}`);
    expect(response.status).toBe(401);
  });

  it('the legacy GET /api/reportes/pasadas-muestras endpoint no longer exists', async () => {
    const response = await request(app).get('/api/reportes/pasadas-muestras');
    expect(response.status).toBe(404);
  });

  it('GET /api/reportes/rutas-pasada returns 200 and correct content-type', async () => {
    const response = await request(app).get('/api/reportes/rutas-pasada');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(getReporteRutasPasada).toHaveBeenCalled();
  });

  it('GET /api/reportes/rutas-pasada returns 401 without auth and skips the handler', async () => {
    auth.rejectAll = true;
    const response = await request(app).get('/api/reportes/rutas-pasada');

    expect(response.status).toBe(401);
    expect(getReporteRutasPasada).not.toHaveBeenCalled();
  });
});
