import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock the controller directly to avoid depending on @mikro-orm/core in this test
vi.mock('./controllers/reporte.controller.js', () => ({
  getReportePasadasMuestras: vi.fn((req: any, res: any) => {
    res
      .setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .send(Buffer.from('fake-excel-data'));
  }),
}));

vi.mock('./middlewares/auth.middleware.js', () => ({
  authenticateJWT: (_req: any, _res: any, next: any) => next(),
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

import reportesRoutes from './routes/reportes.routes.js';
import { getReportePasadasMuestras } from './controllers/reporte.controller.js';

const app = express();
app.use('/api/reportes', reportesRoutes);

describe('API Reportes Integration', () => {
  it('GET /api/reportes/pasadas-muestras returns 200 and correct content-type', async () => {
    const response = await request(app)
      .get('/api/reportes/pasadas-muestras')
      .query({ desde: '2023-01-01', hasta: '2023-01-05' });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(getReportePasadasMuestras).toHaveBeenCalled();
  });
});

