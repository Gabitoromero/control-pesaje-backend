import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getReporteMuestras, getReportePasadas, getReporteRutasPasada } from './reporte.controller.js';
import { RequestContext, type EntityManager } from '@mikro-orm/core';
import { reporteService } from '../services/reporte.service.js';
import { Request, Response, NextFunction } from 'express';

vi.mock('@mikro-orm/core', () => ({
  RequestContext: {
    getEntityManager: vi.fn(),
  },
}));

vi.mock('../services/reporte.service.js', () => ({
  reporteService: {
    generateReporteMuestras: vi.fn(),
    generateReportePasadas: vi.fn(),
    generateReporteRutasPasada: vi.fn(),
  },
}));

type RutasWorkbook = Awaited<ReturnType<typeof reporteService.generateReporteRutasPasada>>;

/** Makes `RequestContext.getEntityManager()` return a partial EntityManager stub. */
const stubEntityManager = (em: unknown) =>
  vi.mocked(RequestContext.getEntityManager).mockReturnValue(em as EntityManager | undefined);

describe.each([
  { name: 'getReporteMuestras', handler: getReporteMuestras, generator: 'generateReporteMuestras', prefix: 'reporte-muestras' },
  { name: 'getReportePasadas', handler: getReportePasadas, generator: 'generateReportePasadas', prefix: 'reporte-pasadas' },
] as const)('$name (date range report)', ({ handler, generator, prefix }) => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;
  let jsonMock: ReturnType<typeof vi.fn>;
  let setHeaderMock: ReturnType<typeof vi.fn>;
  let endMock: ReturnType<typeof vi.fn>;
  const run = () => handler(req as Request, res as Response, next as unknown as NextFunction);
  const generate = () => reporteService[generator] as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    setHeaderMock = vi.fn();
    endMock = vi.fn();
    req = { query: {} };
    res = { status: statusMock, setHeader: setHeaderMock, end: endMock } as unknown as Partial<Response>;
    next = vi.fn();
  });

  it('debe devolver 400 si faltan parámetros', async () => {
    await run();
    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({ success: false, error: 'Faltan parámetros desde o hasta' });
  });

  it('debe devolver 400 si las fechas son inválidas', async () => {
    req.query = { desde: 'invalid', hasta: 'invalid' };
    await run();
    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({ success: false, error: 'Fechas inválidas' });
  });

  it('acepta un rango de exactamente 90 días (límite)', async () => {
    // 2023-01-01 .. 2023-03-31 inclusive = 90 days
    req.query = { desde: '2023-01-01', hasta: '2023-03-31' };
    stubEntityManager({});
    const mockWorkbook = { xlsx: { write: vi.fn() } };
    generate().mockResolvedValue(mockWorkbook);

    await run();

    expect(statusMock).not.toHaveBeenCalled();
    expect(generate()).toHaveBeenCalledTimes(1);
  });

  it('devuelve 400 si el rango es de 91 días', async () => {
    // 2023-01-01 .. 2023-04-01 inclusive = 91 days
    req.query = { desde: '2023-01-01', hasta: '2023-04-01' };
    await run();
    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({ success: false, error: 'El rango máximo es de 90 días' });
    expect(generate()).not.toHaveBeenCalled();
  });

  it('el rango anterior de 5 días ya no es el límite', async () => {
    req.query = { desde: '2023-01-01T00:00:00Z', hasta: '2023-01-07T00:00:00Z' };
    stubEntityManager({});
    generate().mockResolvedValue({ xlsx: { write: vi.fn() } });
    await run();
    expect(statusMock).not.toHaveBeenCalled();
  });

  it('devuelve 500 si no hay EntityManager', async () => {
    req.query = { desde: '2023-01-01', hasta: '2023-01-02' };
    stubEntityManager(undefined);
    await run();
    expect(statusMock).toHaveBeenCalledWith(500);
    expect(generate()).not.toHaveBeenCalled();
  });

  it('llama al servicio con las fechas del rango, envía el libro y fija los headers', async () => {
    req.query = { desde: '2023-01-01T00:00:00Z', hasta: '2023-01-05T23:59:59Z' };
    const emMock = {};
    stubEntityManager(emMock);
    const mockWorkbook = { xlsx: { write: vi.fn() } };
    generate().mockResolvedValue(mockWorkbook);

    await run();

    expect(generate()).toHaveBeenCalledWith(
      emMock,
      new Date('2023-01-01T00:00:00.000-03:00'),
      new Date('2023-01-05T23:59:59.999-03:00'),
    );
    expect(mockWorkbook.xlsx.write).toHaveBeenCalledWith(res);
    expect(setHeaderMock).toHaveBeenCalledWith(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(setHeaderMock).toHaveBeenCalledWith('Content-Disposition', `attachment; filename="${prefix}-2023-01-01.xlsx"`);
    expect(endMock).toHaveBeenCalled();
  });

  it('reenvía los errores del servicio a next', async () => {
    const err = new Error('db down');
    req.query = { desde: '2023-01-01', hasta: '2023-01-02' };
    stubEntityManager({});
    generate().mockRejectedValue(err);
    await run();
    expect(next).toHaveBeenCalledWith(err);
    expect(setHeaderMock).not.toHaveBeenCalled();
  });
});

describe('getReporteRutasPasada', () => {
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;
  let jsonMock: ReturnType<typeof vi.fn>;
  let setHeaderMock: ReturnType<typeof vi.fn>;
  let endMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    setHeaderMock = vi.fn();
    endMock = vi.fn();
    req = { query: {} };
    res = { status: statusMock, setHeader: setHeaderMock, end: endMock } as unknown as Partial<Response>;
    next = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls the service with the entity manager and streams the workbook', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T15:00:00Z'));
    const emMock = {};
    stubEntityManager(emMock);
    const mockWorkbook = { xlsx: { write: vi.fn() } };
    vi.mocked(reporteService.generateReporteRutasPasada).mockResolvedValue(mockWorkbook as unknown as RutasWorkbook);

    await getReporteRutasPasada(req as Request, res as Response, next as unknown as NextFunction);

    expect(reporteService.generateReporteRutasPasada).toHaveBeenCalledWith(emMock);
    expect(mockWorkbook.xlsx.write).toHaveBeenCalledWith(res);
    expect(endMock).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('sets the XLSX content type and a dated attachment filename', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T15:00:00Z'));
    stubEntityManager({});
    vi.mocked(reporteService.generateReporteRutasPasada).mockResolvedValue({ xlsx: { write: vi.fn() } } as unknown as RutasWorkbook);

    await getReporteRutasPasada(req as Request, res as Response, next as unknown as NextFunction);

    expect(setHeaderMock).toHaveBeenCalledWith('Content-Type', XLSX_MIME);
    expect(setHeaderMock).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="reporte-rutas-pasada-2026-10-08.xlsx"',
    );
  });

  it('uses the Buenos Aires date late in the evening UTC', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T01:30:00Z'));
    stubEntityManager({});
    vi.mocked(reporteService.generateReporteRutasPasada).mockResolvedValue({ xlsx: { write: vi.fn() } } as unknown as RutasWorkbook);

    await getReporteRutasPasada(req as Request, res as Response, next as unknown as NextFunction);

    expect(setHeaderMock).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="reporte-rutas-pasada-2026-10-08.xlsx"',
    );
  });

  it('returns 500 when the entity manager is not available', async () => {
    stubEntityManager(undefined);

    await getReporteRutasPasada(req as Request, res as Response, next as unknown as NextFunction);

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({ success: false, error: 'EntityManager not available' });
    expect(reporteService.generateReporteRutasPasada).not.toHaveBeenCalled();
  });

  it('forwards service errors to next without partial headers', async () => {
    const err = new Error('db down');
    stubEntityManager({});
    vi.mocked(reporteService.generateReporteRutasPasada).mockRejectedValue(err);

    await getReporteRutasPasada(req as Request, res as Response, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith(err);
    expect(setHeaderMock).not.toHaveBeenCalled();
    expect(endMock).not.toHaveBeenCalled();
  });
});
