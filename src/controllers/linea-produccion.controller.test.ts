import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { createLineaProduccionHandlers } from './linea-produccion.controller.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../services/device-pairing.service.js', () => ({
  assignHardwareIdToLinea: vi.fn(),
  unassignDeviceFromLinea: vi.fn(),
}));

vi.mock('../socket/device-pairing.handler.js', () => ({
  disconnectDeviceByHardwareId: vi.fn(),
}));

vi.mock('../socket/index.js', () => ({
  getIo: vi.fn(),
}));

vi.mock('@mikro-orm/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mikro-orm/core')>();
  return {
    ...actual,
    RequestContext: {
      getEntityManager: vi.fn(() => ({})),
    },
  };
});

import { assignHardwareIdToLinea, unassignDeviceFromLinea } from '../services/device-pairing.service.js';
import { disconnectDeviceByHardwareId } from '../socket/device-pairing.handler.js';
import { RequestContext } from '@mikro-orm/core';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRes() {
  const mock = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockImplementation((body: unknown) => {
      mock.body = body;
      return mock;
    }),
    body: null as unknown,
  };
  return { mock };
}

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as unknown as Request;
}

function makeServiceMock() {
  return {
    findAll: vi.fn(),
    findAllInactive: vi.fn(),
    findById: vi.fn(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createLineaProduccionHandlers', () => {
  let service: ReturnType<typeof makeServiceMock>;
  let handlers: ReturnType<typeof createLineaProduccionHandlers>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = makeServiceMock();
    handlers = createLineaProduccionHandlers(service as never);
  });

  describe('list / getOne DTO', () => {
    const linea = {
      id: 1,
      nombre: 'Linea 1',
      rutaPasadaActiva: undefined,
      activo: true,
      dispositivo: undefined,
      balanza: { id: 5 },
      articulo: { id: 6 },
      observacion: 'linea reservada para lote especial',
    };

    it('includes observacion in list output', async () => {
      service.findAll.mockResolvedValue([linea]);

      const req = makeReq();
      const { mock } = makeRes();

      await handlers.list(req, mock as unknown as Response, vi.fn());

      const data = (mock.body as { data: Array<{ observacion?: string }> }).data;
      expect(data[0].observacion).toBe('linea reservada para lote especial');
    });

    it('includes observacion as null in list output when unset', async () => {
      service.findAll.mockResolvedValue([{ ...linea, observacion: null }]);

      const req = makeReq();
      const { mock } = makeRes();

      await handlers.list(req, mock as unknown as Response, vi.fn());

      const data = (mock.body as { data: Array<{ observacion: unknown }> }).data;
      expect(data[0].observacion).toBeNull();
    });

    it('includes observacion in getOne output', async () => {
      service.findById.mockResolvedValue(linea);

      const req = makeReq({ params: { id: '1' } });
      const { mock } = makeRes();

      await handlers.getOne(req, mock as unknown as Response, vi.fn());

      const data = (mock.body as { data: { observacion?: string } }).data;
      expect(data.observacion).toBe('linea reservada para lote especial');
    });
  });

  describe('assignDevice DTO', () => {
    it('includes observacion in the response shape', async () => {
      const hardwareId = '123e4567-e89b-12d3-a456-426614174000';
      vi.mocked(assignHardwareIdToLinea).mockResolvedValue({
        linea: {
          id: 1,
          nombre: 'Linea 1',
          rutaPasadaActiva: undefined,
          activo: true,
          observacion: 'nota de la linea',
        } as never,
        dispositivo: { hardwareId, nombre: 'Pi-1234', ultimaConexionAt: null } as never,
      });

      const req = makeReq({ params: { id: '1' }, body: { hardwareId } });
      const { mock } = makeRes();

      await handlers.assignDevice(req, mock as unknown as Response, vi.fn());

      const data = (mock.body as { data: { observacion?: string } }).data;
      expect(data.observacion).toBe('nota de la linea');
    });
  });
  describe('unassignDevice', () => {
    const hardwareId = '123e4567-e89b-12d3-a456-426614174000';
    const lineaRow = { id: 1, nombre: 'Linea 1', activo: true, observacion: null };

    const run = async (previousDevice: unknown) => {
      const em = { findOne: vi.fn().mockResolvedValue({ ...lineaRow, dispositivo: previousDevice }) };
      vi.mocked(RequestContext.getEntityManager).mockReturnValue(em as never);
      vi.mocked(unassignDeviceFromLinea).mockResolvedValue({ ...lineaRow, dispositivo: null } as never);
      const req = makeReq({ params: { id: '1' }, body: { hardwareId: null } });
      const { mock } = makeRes();
      await handlers.assignDevice(req, mock as unknown as Response, vi.fn());
      return mock;
    };

    it('disconnects the previously paired device socket after a successful unassign', async () => {
      const mock = await run({ hardwareId });
      expect(disconnectDeviceByHardwareId).toHaveBeenCalledWith(undefined, hardwareId);
      expect((mock.body as { success: boolean }).success).toBe(true);
    });

    it('does nothing when the línea had no device', async () => {
      const mock = await run(null);
      expect(disconnectDeviceByHardwareId).not.toHaveBeenCalled();
      expect((mock.body as { success: boolean }).success).toBe(true);
    });

    it('never fails the HTTP response when the disconnect throws', async () => {
      vi.mocked(disconnectDeviceByHardwareId).mockImplementation(() => {
        throw new Error('io down');
      });
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mock = await run({ hardwareId });
      expect((mock.body as { success: boolean }).success).toBe(true);
      expect(mock.status).not.toHaveBeenCalled();
      errSpy.mockRestore();
    });
  });
});
