import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getReportePasadasMuestras } from './reporte.controller.js';
import { RequestContext } from '@mikro-orm/core';
import { reporteService } from '../services/reporte.service.js';
import { Request, Response } from 'express';

vi.mock('@mikro-orm/core', () => ({
  RequestContext: {
    getEntityManager: vi.fn(),
  },
}));

vi.mock('../services/reporte.service.js', () => ({
  reporteService: {
    generarReportePasadasMuestras: vi.fn(),
  },
}));

describe('Reporte Controller', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;
  let jsonMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    req = { query: {} };
    res = { status: statusMock } as any;
    next = vi.fn();
    vi.clearAllMocks();
  });

  it('debe devolver 400 si faltan parámetros', async () => {
    await getReportePasadasMuestras(req as Request, res as Response, next as any);
    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({ success: false, error: 'Faltan parámetros desde o hasta' });
  });

  it('debe devolver 400 si las fechas son inválidas', async () => {
    req.query = { desde: 'invalid', hasta: 'invalid' };
    await getReportePasadasMuestras(req as Request, res as Response, next as any);
    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({ success: false, error: 'Fechas inválidas' });
  });

  it('debe devolver 400 si el rango es mayor a 5 días', async () => {
    req.query = { desde: '2023-01-01T00:00:00Z', hasta: '2023-01-07T00:00:00Z' };
    await getReportePasadasMuestras(req as Request, res as Response, next as any);
    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({ success: false, error: 'El rango máximo es de 5 días' });
  });

  it('debe llamar al servicio si las fechas son válidas y están dentro de rango', async () => {
    req.query = { desde: '2023-01-01T00:00:00Z', hasta: '2023-01-05T23:59:59Z' };
    const emMock = {};
    (RequestContext.getEntityManager as any).mockReturnValue(emMock);

    await getReportePasadasMuestras(req as Request, res as Response, next as any);
    expect(reporteService.generarReportePasadasMuestras).toHaveBeenCalledWith(emMock, expect.any(Date), expect.any(Date), res);
  });
});
