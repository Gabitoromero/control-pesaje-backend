import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getReportePasadasMuestras, getReporteRutasPasada } from './reporte.controller.js';
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
    generateReportePasadasMuestras: vi.fn(),
    generateReporteRutasPasada: vi.fn(),
  },
}));

describe('Reporte Controller', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;
  let jsonMock: ReturnType<typeof vi.fn>;
  let setHeaderMock: ReturnType<typeof vi.fn>;
  let endMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    req = { query: {} };
    setHeaderMock = vi.fn();
    endMock = vi.fn();
    res = { status: statusMock, setHeader: setHeaderMock, end: endMock } as any;
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
    const mockWorkbook = { xlsx: { write: vi.fn() } };
    (reporteService.generateReportePasadasMuestras as any).mockResolvedValue(mockWorkbook);

    await getReportePasadasMuestras(req as Request, res as Response, next as any);
    expect(reporteService.generateReportePasadasMuestras).toHaveBeenCalledWith(emMock, expect.any(Date), expect.any(Date));
    expect(mockWorkbook.xlsx.write).toHaveBeenCalledWith(res);
    expect(setHeaderMock).toHaveBeenCalledTimes(2);
    expect(endMock).toHaveBeenCalled();
  });

  describe('Integración - reporteService', () => {
    it('debe contener las columnas de límites y balanza con la información correcta', async () => {
      const { reporteService: realReporteService } = await vi.importActual<typeof import('../services/reporte.service.js')>('../services/reporte.service.js');
      
      const emMock = {
        find: vi.fn().mockImplementation((entityClass: any) => {
          if (entityClass.name === 'Muestra') {
            return Promise.resolve([{
              lineaProduccion: { id: 1, nombre: 'Linea 1' },
              rutaPasada: { nombre: 'Ruta 1' },
              pasada: { id: 1, numero: 'P-001', estado: 'EN CURSO' },
              etapa: { nombre: 'Etapa 1' },
              timestamp: new Date('2023-01-01T10:00:00Z'),
              pesoNeto: 100,
              pesoMinimo: 90,
              pesoIdeal: 100,
              pesoMaximo: 110,
              estadoValidacion: 'OK',
              observacion: 'ninguna',
              usuario: { nombreApellido: 'Juan Perez' }
            }]);
          }
          if (entityClass.name === 'Pasada') {
            return Promise.resolve([{
              id: 1,
              lineaProduccion: { id: 1, nombre: 'Linea 1' },
              rutaPasada: { nombre: 'Ruta 1' },
              balanza: { nombre: 'Balanza 1' },
              numero: 'P-001',
              articulo: { codigo: 'A-001', nombre: 'Articulo 1' },
              estado: 'EN CURSO',
              horaInicio: new Date('2023-01-01T09:00:00Z'),
              horaCierre: new Date('2023-01-01T11:00:00Z'),
              usuario: { nombreApellido: 'Juan Perez' },
              motivoCierre: '',
              observacionCierre: ''
            }]);
          }
          return Promise.resolve([]);
        })
      };

      const workbook = await realReporteService.generateReportePasadasMuestras(emMock as any, new Date(), new Date());
      const muestrasSheet = workbook.getWorksheet('Muestras - Linea 1');
      const pasadasSheet = workbook.getWorksheet('Pasadas - Linea 1');

      expect(muestrasSheet).toBeDefined();
      expect(pasadasSheet).toBeDefined();

      const headersMuestras = muestrasSheet!.getRow(1).values as string[];
      expect(headersMuestras).toContain('Límite Mín (kg)');
      expect(headersMuestras).toContain('Peso Ideal (kg)');
      expect(headersMuestras).toContain('Límite Máx (kg)');

      const rowMuestra = muestrasSheet!.getRow(2).values as any[];
      expect(rowMuestra).toContain(90);
      expect(rowMuestra).toContain(100);
      expect(rowMuestra).toContain(110);

      const headersPasadas = pasadasSheet!.getRow(1).values as string[];
      expect(headersPasadas).toContain('Balanza');
      
      const rowPasada = pasadasSheet!.getRow(2).values as any[];
      expect(rowPasada).toContain('Balanza 1');
    });

    it('debe incluir la columna Observación de inicio justo después de N° Pasada, distinta de Observación Cierre', async () => {
      const { reporteService: realReporteService } = await vi.importActual<typeof import('../services/reporte.service.js')>('../services/reporte.service.js');

      const emMock = {
        find: vi.fn().mockImplementation((entityClass: any) => {
          if (entityClass.name === 'Muestra') {
            return Promise.resolve([]);
          }
          if (entityClass.name === 'Pasada') {
            return Promise.resolve([{
              id: 1,
              lineaProduccion: { id: 1, nombre: 'Linea 1' },
              rutaPasada: { nombre: 'Ruta 1' },
              balanza: { nombre: 'Balanza 1' },
              numero: 'P-001',
              articulo: { codigo: 'A-001', nombre: 'Articulo 1' },
              estado: 'EN CURSO',
              horaInicio: new Date('2023-01-01T09:00:00Z'),
              horaCierre: new Date('2023-01-01T11:00:00Z'),
              usuario: { nombreApellido: 'Juan Perez' },
              motivoCierre: '',
              observacionCierre: 'nota cierre',
              observacion: 'nota inicio'
            }]);
          }
          return Promise.resolve([]);
        })
      };

      const workbook = await realReporteService.generateReportePasadasMuestras(emMock as any, new Date(), new Date());
      const pasadasSheet = workbook.getWorksheet('Pasadas - Linea 1');

      const headersPasadas = pasadasSheet!.getRow(1).values as string[];
      // values[0] is undefined (1-indexed); position 5 = right after N° Pasada (position 4)
      expect(headersPasadas[4]).toBe('N° Pasada');
      expect(headersPasadas[5]).toBe('Observación');
      expect(headersPasadas[headersPasadas.length - 1]).toBe('Observación Cierre');

      const rowPasada = pasadasSheet!.getRow(2).values as any[];
      expect(rowPasada[5]).toBe('nota inicio');
      expect(rowPasada[rowPasada.length - 1]).toBe('nota cierre');
    });

    it('debe mostrar "-" en la columna Observación cuando la pasada no tiene observacion', async () => {
      const { reporteService: realReporteService } = await vi.importActual<typeof import('../services/reporte.service.js')>('../services/reporte.service.js');

      const emMock = {
        find: vi.fn().mockImplementation((entityClass: any) => {
          if (entityClass.name === 'Muestra') {
            return Promise.resolve([]);
          }
          if (entityClass.name === 'Pasada') {
            return Promise.resolve([{
              id: 1,
              lineaProduccion: { id: 1, nombre: 'Linea 1' },
              rutaPasada: { nombre: 'Ruta 1' },
              balanza: { nombre: 'Balanza 1' },
              numero: 'P-001',
              articulo: { codigo: 'A-001', nombre: 'Articulo 1' },
              estado: 'EN CURSO',
              horaInicio: new Date('2023-01-01T09:00:00Z'),
              horaCierre: new Date('2023-01-01T11:00:00Z'),
              usuario: { nombreApellido: 'Juan Perez' },
              motivoCierre: '',
              observacionCierre: '',
              observacion: null
            }]);
          }
          return Promise.resolve([]);
        })
      };

      const workbook = await realReporteService.generateReportePasadasMuestras(emMock as any, new Date(), new Date());
      const pasadasSheet = workbook.getWorksheet('Pasadas - Linea 1');
      const rowPasada = pasadasSheet!.getRow(2).values as any[];
      expect(rowPasada[5]).toBe('-');
    });

    it('no debe referenciar LineaProduccion.observacion en ninguna hoja', async () => {
      const { reporteService: realReporteService } = await vi.importActual<typeof import('../services/reporte.service.js')>('../services/reporte.service.js');

      const emMock = {
        find: vi.fn().mockImplementation((entityClass: any) => {
          if (entityClass.name === 'Muestra') return Promise.resolve([]);
          if (entityClass.name === 'Pasada') {
            return Promise.resolve([{
              id: 1,
              lineaProduccion: { id: 1, nombre: 'Linea 1', observacion: 'nota de linea que no debe aparecer' },
              rutaPasada: { nombre: 'Ruta 1' },
              balanza: { nombre: 'Balanza 1' },
              numero: 'P-001',
              articulo: { codigo: 'A-001', nombre: 'Articulo 1' },
              estado: 'EN CURSO',
              horaInicio: new Date('2023-01-01T09:00:00Z'),
              horaCierre: new Date('2023-01-01T11:00:00Z'),
              usuario: { nombreApellido: 'Juan Perez' },
              motivoCierre: '',
              observacionCierre: '',
              observacion: null
            }]);
          }
          return Promise.resolve([]);
        })
      };

      const workbook = await realReporteService.generateReportePasadasMuestras(emMock as any, new Date(), new Date());
      const pasadasSheet = workbook.getWorksheet('Pasadas - Linea 1');
      const rowPasada = pasadasSheet!.getRow(2).values as any[];
      expect(rowPasada).not.toContain('nota de linea que no debe aparecer');
    });
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
    res = { status: statusMock, setHeader: setHeaderMock, end: endMock } as any;
    next = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls the service with the entity manager and streams the workbook', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T15:00:00Z'));
    const emMock = {};
    (RequestContext.getEntityManager as any).mockReturnValue(emMock);
    const mockWorkbook = { xlsx: { write: vi.fn() } };
    (reporteService.generateReporteRutasPasada as any).mockResolvedValue(mockWorkbook);

    await getReporteRutasPasada(req as Request, res as Response, next as any);

    expect(reporteService.generateReporteRutasPasada).toHaveBeenCalledWith(emMock);
    expect(mockWorkbook.xlsx.write).toHaveBeenCalledWith(res);
    expect(endMock).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('sets the XLSX content type and a dated attachment filename', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T15:00:00Z'));
    (RequestContext.getEntityManager as any).mockReturnValue({});
    (reporteService.generateReporteRutasPasada as any).mockResolvedValue({ xlsx: { write: vi.fn() } });

    await getReporteRutasPasada(req as Request, res as Response, next as any);

    expect(setHeaderMock).toHaveBeenCalledWith('Content-Type', XLSX_MIME);
    expect(setHeaderMock).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="reporte-rutas-pasada-2026-10-08.xlsx"',
    );
  });

  it('uses the Buenos Aires date late in the evening UTC', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T01:30:00Z'));
    (RequestContext.getEntityManager as any).mockReturnValue({});
    (reporteService.generateReporteRutasPasada as any).mockResolvedValue({ xlsx: { write: vi.fn() } });

    await getReporteRutasPasada(req as Request, res as Response, next as any);

    expect(setHeaderMock).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="reporte-rutas-pasada-2026-10-08.xlsx"',
    );
  });

  it('returns 500 when the entity manager is not available', async () => {
    (RequestContext.getEntityManager as any).mockReturnValue(undefined);

    await getReporteRutasPasada(req as Request, res as Response, next as any);

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({ success: false, error: 'EntityManager not available' });
    expect(reporteService.generateReporteRutasPasada).not.toHaveBeenCalled();
  });

  it('forwards service errors to next without partial headers', async () => {
    const err = new Error('db down');
    (RequestContext.getEntityManager as any).mockReturnValue({});
    (reporteService.generateReporteRutasPasada as any).mockRejectedValue(err);

    await getReporteRutasPasada(req as Request, res as Response, next as any);

    expect(next).toHaveBeenCalledWith(err);
    expect(setHeaderMock).not.toHaveBeenCalled();
    expect(endMock).not.toHaveBeenCalled();
  });
});
