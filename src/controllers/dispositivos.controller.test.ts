import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../services/device-registry.service.js', () => ({
  deviceRegistryService: {
    isHardwareIdConnected: vi.fn(),
  },
}));

const mockEm = {
  find: vi.fn(),
  nativeDelete: vi.fn(),
};

vi.mock('@mikro-orm/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@mikro-orm/core')>();
  return {
    ...original,
    RequestContext: {
      ...original.RequestContext,
      getEntityManager: () => mockEm,
    },
  };
});

const { getDispositivosConectados, deleteDispositivo } = await import('./dispositivos.controller.js');
const { deviceRegistryService } = await import('../services/device-registry.service.js');

const makeRes = (): Response =>
  ({
    json: vi.fn(),
    status: vi.fn().mockReturnThis(),
  }) as unknown as Response;

describe('Dispositivos Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getDispositivosConectados', () => {
    it('returns dispositivos with estado Conectado and línea nombre when the hardwareId is live in the registry', async () => {
      const dispositivo = {
        hardwareId: 'hw-1',
        nombre: 'Pi-hw-1',
        lineaProduccion: { id: 5, nombre: 'Línea A' },
        ultimaConexionAt: new Date('2026-01-01T00:00:00Z'),
      };
      mockEm.find.mockResolvedValue([dispositivo]);
      vi.mocked(deviceRegistryService.isHardwareIdConnected).mockReturnValue(true);

      const req = {} as Request;
      const res = makeRes();

      await getDispositivosConectados(req, res);

      expect(mockEm.find).toHaveBeenCalledWith(
        expect.anything(),
        {},
        expect.objectContaining({ populate: ['lineaProduccion'] })
      );
      expect(deviceRegistryService.isHardwareIdConnected).toHaveBeenCalledWith('hw-1');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [
          {
            hardwareId: 'hw-1',
            nombre: 'Pi-hw-1',
            lineaId: 5,
            lineaNombre: 'Línea A',
            estado: 'Conectado',
            ultimaConexionAt: new Date('2026-01-01T00:00:00Z'),
          },
        ]
      });
    });

    it('returns estado Desconectado and null línea fields for an unpaired offline device (row stays visible)', async () => {
      const dispositivo = {
        hardwareId: 'hw-2',
        nombre: 'Pi-hw-2',
        lineaProduccion: undefined,
        ultimaConexionAt: null,
      };
      mockEm.find.mockResolvedValue([dispositivo]);
      vi.mocked(deviceRegistryService.isHardwareIdConnected).mockReturnValue(false);

      const req = {} as Request;
      const res = makeRes();

      await getDispositivosConectados(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [
          {
            hardwareId: 'hw-2',
            nombre: 'Pi-hw-2',
            lineaId: null,
            lineaNombre: null,
            estado: 'Desconectado',
            ultimaConexionAt: null,
          },
        ]
      });
    });

    it('returns 500 when there is no EntityManager in RequestContext', async () => {
      const req = {} as Request;
      const res = makeRes();
      const coreModule = await import('@mikro-orm/core');
      const spy = vi.spyOn(coreModule.RequestContext, 'getEntityManager').mockReturnValue(undefined);

      await getDispositivosConectados(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      spy.mockRestore();
    });
  });

  describe('deleteDispositivo', () => {
    it('hard-deletes the row and returns success (no soft-delete trace)', async () => {
      mockEm.nativeDelete.mockResolvedValue(1);
      const req = { params: { id: '3' } } as unknown as Request;
      const res = makeRes();

      await deleteDispositivo(req, res);

      expect(mockEm.nativeDelete).toHaveBeenCalledWith(expect.anything(), { hardwareId: '3' });
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { hardwareId: '3' } });
    });

    it('returns 404 when the dispositivo does not exist', async () => {
      mockEm.nativeDelete.mockResolvedValue(0);
      const req = { params: { id: '999' } } as unknown as Request;
      const res = makeRes();

      await deleteDispositivo(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Registro no encontrado' },
      });
    });
  });
});
