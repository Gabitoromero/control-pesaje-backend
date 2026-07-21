import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import { getLineas, getResumen, getKpis, getEtapas } from './dashboard.controller.js';
import { RequestContext } from '@mikro-orm/core';
import { deviceRegistryService } from '../services/device-registry.service.js';
import { Muestra } from '../models/Muestra.js';
import { RutaPasadaEtapa } from '../models/RutaPasadaEtapa.js';
import { Pasada } from '../models/Pasada.js';
import { LineaProduccion } from '../models/LineaProduccion.js';

vi.mock('@mikro-orm/core', () => {
  return {
    RequestContext: {
      getEntityManager: vi.fn(),
    }
  };
});

vi.mock('../services/device-registry.service.js', () => {
  return {
    deviceRegistryService: {
      hasDeviceForLinea: vi.fn(),
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

describe('dashboard.controller', () => {
  let mockEm: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEm = {
      findOne: vi.fn(),
      find: vi.fn(),
      count: vi.fn(),
    };
    (RequestContext.getEntityManager as any).mockReturnValue(mockEm);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getLineas', () => {
    it('returns lineas de produccion with updatedAt', async () => {
      const req = {} as Request;
      const { captured, mock: res } = makeRes();
      const now = new Date('2026-07-13T10:00:00.000Z');

      mockEm.find.mockResolvedValue([{ id: 1, nombre: 'Linea 1', updatedAt: now }]);

      await getLineas(req, res, vi.fn());

      expect(captured.statusCode).toBe(200);
      expect((captured.body as any).data.length).toBe(1);
      expect((captured.body as any).data[0].id).toBe(1);
      expect((captured.body as any).data[0].nombre).toBe('Linea 1');
    });

    it('populates rutaPasadaActiva and dispositivo', async () => {
      const req = {} as Request;
      const { mock: res } = makeRes();

      mockEm.find.mockResolvedValue([]);

      await getLineas(req, res, vi.fn());

      expect(mockEm.find).toHaveBeenCalledWith(
        LineaProduccion,
        expect.anything(),
        expect.objectContaining({ populate: expect.arrayContaining(['rutaPasadaActiva', 'dispositivo']) })
      );
    });
  });

  describe('getResumen', () => {
    it('returns 200 estado "esperando" if linea has rutaPasadaActiva but no Pasada EN_CURSO', async () => {
      mockEm.findOne.mockImplementation((entity: any) => {
        if (entity === Pasada) return Promise.resolve(null);
        if (entity === LineaProduccion) return Promise.resolve({ id: 1, rutaPasadaActiva: { id: 5 } });
        return Promise.resolve(null);
      });
      (deviceRegistryService.hasDeviceForLinea as any).mockReturnValue(false);

      const req = { params: { lineaId: '1' } } as unknown as Request;
      const { captured, mock: res } = makeRes();

      await getResumen(req, res, vi.fn());

      expect(mockEm.findOne).toHaveBeenCalledWith(
        Pasada,
        expect.objectContaining({ lineaProduccion: 1, estado: 'en_curso', activo: true })
      );
      expect(mockEm.findOne).toHaveBeenCalledWith(
        LineaProduccion,
        expect.objectContaining({ id: 1, activo: true })
      );
      expect(captured.statusCode).toBe(200);
      expect((captured.body as any).data).toEqual({
        conectado: false,
        pasadaEnCurso: null
      });
    });

    it('returns 404 if the linea has no rutaPasadaActiva at all', async () => {
      mockEm.findOne.mockImplementation((entity: any) => {
        if (entity === Pasada) return Promise.resolve(null);
        if (entity === LineaProduccion) return Promise.resolve({ id: 1, rutaPasadaActiva: null });
        return Promise.resolve(null);
      });

      const req = { params: { lineaId: '1' } } as unknown as Request;
      const { captured, mock: res } = makeRes();

      await getResumen(req, res, vi.fn());

      expect(captured.statusCode).toBe(404);
      expect((captured.body as any).error.message).toBe('No hay pasada activa para esta linea');
    });

    it('returns resumen for active pasada', async () => {
      const timeZero = new Date('2026-07-13T10:00:00.000Z');
      const now = new Date('2026-07-13T10:05:00.000Z');
      
      vi.useFakeTimers();
      vi.setSystemTime(now);

      mockEm.findOne.mockResolvedValue({ id: 10, horaInicio: timeZero });
      (deviceRegistryService.hasDeviceForLinea as any).mockReturnValue(true);

      const req = { params: { lineaId: '1' } } as unknown as Request;
      const { captured, mock: res } = makeRes();

      await getResumen(req, res, vi.fn());

      expect(deviceRegistryService.hasDeviceForLinea).toHaveBeenCalledWith(1);
      expect(captured.statusCode).toBe(200);
      expect((captured.body as any).data.conectado).toBe(true);
      expect((captured.body as any).data.pasadaEnCurso.id).toBe(10);
      expect((captured.body as any).data.pasadaEnCurso.tiempoTranscurrido).toBe(5 * 60 * 1000);
    });
  });

  describe('getKpis', () => {
    it('returns 200 estado "esperando" if linea has rutaPasadaActiva but no Pasada EN_CURSO', async () => {
      mockEm.findOne.mockImplementation((entity: any) => {
        if (entity === Pasada) return Promise.resolve(null);
        if (entity === LineaProduccion) return Promise.resolve({ id: 1, rutaPasadaActiva: { id: 5 } });
        return Promise.resolve(null);
      });

      const req = { params: { lineaId: '1' } } as unknown as Request;
      const { captured, mock: res } = makeRes();

      await getKpis(req, res, vi.fn());

      expect(captured.statusCode).toBe(200);
      expect((captured.body as any).data).toEqual({
        muestrasTotales: 0,
        fueraRango: 0,
        pasadasFinalizadas: 0,
        pasadasEnCurso: 0
      });
    });

    it('returns 404 if the linea has no rutaPasadaActiva at all', async () => {
      mockEm.findOne.mockImplementation((entity: any) => {
        if (entity === Pasada) return Promise.resolve(null);
        if (entity === LineaProduccion) return Promise.resolve({ id: 1, rutaPasadaActiva: null });
        return Promise.resolve(null);
      });

      const req = { params: { lineaId: '1' } } as unknown as Request;
      const { captured, mock: res } = makeRes();

      await getKpis(req, res, vi.fn());

      expect(captured.statusCode).toBe(404);
    });

    it('returns KPIs counting fueraRango by estadoValidacion', async () => {
      const timeZero = new Date('2026-07-13T10:00:00.000Z');
      mockEm.findOne.mockResolvedValue({ 
        id: 10, 
        horaInicio: timeZero,
        rutaPasada: { id: 2 } 
      });

      mockEm.find.mockImplementation((entity: any) => {
        if (entity === Muestra) {
          return Promise.resolve([
            { id: 1, etapa: { id: 1 }, pesoNeto: 10, estadoValidacion: 'ok' },
            { id: 2, etapa: { id: 1 }, pesoNeto: 5, estadoValidacion: 'fuera_de_rango' },
            { id: 3, etapa: { id: 1 }, pesoNeto: 11, estadoValidacion: 'ok' },
          ]);
        }
        return Promise.resolve([]);
      });

      mockEm.count.mockImplementation((entity: any, query: any) => {
        if (query.estado === 'completa') return Promise.resolve(5);
        if (query.estado === 'en_curso') return Promise.resolve(2);
        return Promise.resolve(0);
      });

      const req = { params: { lineaId: '1' } } as unknown as Request;
      const { captured, mock: res } = makeRes();

      await getKpis(req, res, vi.fn());

      expect(mockEm.find).toHaveBeenCalledWith(
        Muestra,
        {
          pasada: 10,
          timestamp: { $gte: timeZero }
        },
        { populate: ['etapa'] }
      );
      
      expect(captured.statusCode).toBe(200);
      expect((captured.body as any).data).toEqual({
        muestrasTotales: 3,
        fueraRango: 1,
        pasadasFinalizadas: 5,
        pasadasEnCurso: 2
      });
    });
  });

  describe('getEtapas', () => {
    it('returns configured stages with 0s if linea has rutaPasadaActiva but no muestras', async () => {
      const timeZero = new Date('2026-07-13T10:00:00.000Z');
      mockEm.findOne.mockImplementation((entity: any) => {
        if (entity === LineaProduccion) return Promise.resolve({ id: 1, rutaPasadaActiva: { id: 5 }, rutaAsignadaAt: timeZero });
        return Promise.resolve(null);
      });
      mockEm.find.mockImplementation((entity: any) => {
        if (entity === RutaPasadaEtapa) {
          return Promise.resolve([
            { etapa: { id: 1, nombre: 'Etapa 1' }, pesoIdeal: 100, pesoMinimo: 90, pesoMaximo: 110 }
          ]);
        }
        if (entity === Muestra) return Promise.resolve([]);
        return Promise.resolve([]);
      });

      const req = { params: { lineaId: '1' } } as unknown as Request;
      const { captured, mock: res } = makeRes();

      await getEtapas(req, res, vi.fn());

      expect(captured.statusCode).toBe(200);
      expect((captured.body as any).data).toEqual([
        {
          etapa: { id: 1, nombre: 'Etapa 1' },
          pesoIdeal: 100,
          pesoMinimo: 90,
          pesoMaximo: 110,
          ultimoPeso: 0,
          porcentajeConforme: 0,
          timeSeries: []
        }
      ]);
    });

    it('returns 404 if the linea has no rutaPasadaActiva at all', async () => {
      mockEm.findOne.mockImplementation((entity: any) => {
        if (entity === LineaProduccion) return Promise.resolve({ id: 1, rutaPasadaActiva: null });
        return Promise.resolve(null);
      });

      const req = { params: { lineaId: '1' } } as unknown as Request;
      const { captured, mock: res } = makeRes();

      await getEtapas(req, res, vi.fn());

      expect(captured.statusCode).toBe(404);
    });

    it('returns empty data if active linea has no config etapas', async () => {
      const timeZero = new Date('2026-07-13T10:00:00.000Z');
      mockEm.findOne.mockResolvedValue({ id: 1, rutaPasadaActiva: { id: 5 }, rutaAsignadaAt: timeZero }); 
      mockEm.find.mockResolvedValue([]);

      const req = { params: { lineaId: '1' } } as unknown as Request;
      const { captured, mock: res } = makeRes();

      await getEtapas(req, res, vi.fn());

      expect(captured.statusCode).toBe(200);
      expect((captured.body as any).data).toEqual([]);
    });

    it('returns etapas stats using estadoValidacion for conformity and pasadaId in timeseries', async () => {
      const timeZero = new Date('2026-07-13T10:00:00.000Z');
      mockEm.findOne.mockResolvedValue({ 
        id: 1, 
        rutaAsignadaAt: timeZero,
        rutaPasadaActiva: { id: 5 }
      });
      
      mockEm.find.mockImplementation((entity: any) => {
        if (entity === RutaPasadaEtapa) {
          return Promise.resolve([
            { etapa: { id: 1, nombre: 'Etapa 1' }, pesoIdeal: 10, pesoMinimo: 8, pesoMaximo: 12 }
          ]);
        }
        if (entity === Muestra) {
          return Promise.resolve([
            { id: 1, etapa: { id: 1 }, pesoNeto: 10, estadoValidacion: 'ok', timestamp: new Date('2026-07-13T10:01:00.000Z'), pasada: { id: 42 } },
            { id: 2, etapa: { id: 1 }, pesoNeto: 5, estadoValidacion: 'ok', timestamp: new Date('2026-07-13T10:02:00.000Z'), pasada: null },
            { id: 3, etapa: { id: 1 }, pesoNeto: 9, estadoValidacion: 'ok', timestamp: new Date('2026-07-13T10:03:00.000Z'), pasada: { id: 42 } },
          ]);
        }
        return Promise.resolve([]);
      });

      const req = { params: { lineaId: '1' } } as unknown as Request;
      const { captured, mock: res } = makeRes();

      await getEtapas(req, res, vi.fn());

      expect(mockEm.find).toHaveBeenCalledWith(
        Muestra,
        {
          lineaProduccion: 1,
          rutaPasada: 5,
          timestamp: { $gte: timeZero }
        },
        { populate: ['etapa', 'pasada'] }
      );
      expect(captured.statusCode).toBe(200);
      expect((captured.body as any).data.length).toBe(1);
      
      const etapa1 = (captured.body as any).data[0];
      expect(etapa1.etapa.nombre).toBe('Etapa 1');
      expect(etapa1.ultimoPeso).toBe(9);
      expect(etapa1.porcentajeConforme).toBe(100);
      
      const ts = etapa1.timeSeries;
      expect(ts[0].pasadaId).toBe(42);
      expect(ts[0].estadoValidacion).toBe('ok');
      expect(ts[1].pasadaId).toBe(null);
    });
  });
});
