import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LineaProduccionService } from './linea-produccion.service.js';
import { ValidationError } from '../utils/errors.js';

// Mock EntityManager
const mockEm = {
  find: vi.fn(),
  findOne: vi.fn(),
  create: vi.fn(),
  assign: vi.fn(),
  flush: vi.fn(),
  persist: vi.fn().mockReturnThis(),
  count: vi.fn(),
};

vi.mock('@mikro-orm/core', () => ({
  RequestContext: {
    getEntityManager: vi.fn(() => mockEm),
  },
}));

describe('LineaProduccionService', () => {
  let service: LineaProduccionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new LineaProduccionService();
  });

  describe('create validations', () => {
    it('throws ValidationError when nombre already exists', async () => {
      mockEm.findOne.mockImplementationOnce(async () => ({ id: 2, nombre: 'Linea 1' }));

      await expect(
        service.create({
          nombre: 'Linea 1',
          numeroBalanza: 1,
        } as any)
      ).rejects.toThrow(ValidationError);
      expect(mockEm.findOne).toHaveBeenCalledOnce();
    });

    it('succeeds when rutaPasadaActiva is null/undefined', async () => {
      mockEm.findOne.mockResolvedValue(null);
      mockEm.create.mockReturnValue({ id: 1 });
      mockEm.flush.mockResolvedValue(undefined);

      const result = await service.create({
        nombre: 'Linea 1',
        numeroBalanza: 1,
        rutaPasadaActiva: null,
      } as any);

      expect(result).toBeDefined();
    });

    it('throws ValidationError when rutaPasadaActiva does not exist or is inactive', async () => {
      mockEm.findOne.mockImplementation(async (entity: any) => {
        if (entity.name === 'LineaProduccion') return null;
        return null;
      });

      await expect(
        service.create({
          nombre: 'Linea 1',
          numeroBalanza: 1,
          rutaPasadaActiva: 999,
        } as any)
      ).rejects.toThrow(ValidationError);

      expect(mockEm.findOne).toHaveBeenCalledTimes(2);
    });

    it('throws ValidationError when rutaPasadaActiva has 0 stages', async () => {
      const mockRoute = {
        id: 2,
        activo: true,
        etapas: { length: 0 },
      };
      mockEm.findOne.mockImplementation(async (entity: any) => {
        if (entity.name === 'LineaProduccion') return null;
        return mockRoute;
      });

      await expect(
        service.create({
          nombre: 'Linea 1',
          numeroBalanza: 1,
          rutaPasadaActiva: 2,
        } as any)
      ).rejects.toThrow('No se puede asignar una ruta sin etapas a una línea de producción');

      expect(mockEm.findOne).toHaveBeenCalledTimes(2);
    });

    it('succeeds when rutaPasadaActiva is active and has >= 1 stage', async () => {
      const mockRoute = {
        id: 3,
        activo: true,
        etapas: { length: 1 },
      };
      mockEm.findOne.mockImplementation(async (entity: any) => {
        if (entity.name === 'LineaProduccion') return null;
        return mockRoute;
      });
      mockEm.create.mockReturnValue({ id: 1, rutaPasadaActiva: mockRoute });
      mockEm.flush.mockResolvedValue(undefined);

      const result = await service.create({
        nombre: 'Linea 1',
        numeroBalanza: 1,
        rutaPasadaActiva: 3,
      } as any);

      expect(result).toBeDefined();
      expect(mockEm.findOne).toHaveBeenCalledTimes(2);
    });
  });

  describe('update validations', () => {
    it('throws ValidationError when updating to an existing nombre', async () => {
      // the duplicate entity has id: 2
      mockEm.findOne.mockResolvedValueOnce({ id: 2, nombre: 'Linea Duplicada' });

      await expect(
        service.update(1, {
          nombre: 'Linea Duplicada',
        } as any)
      ).rejects.toThrow(ValidationError);
    });
    it('throws ValidationError when updated rutaPasadaActiva has 0 stages', async () => {
      const mockRoute = {
        id: 2,
        activo: true,
        etapas: { length: 0 },
      };
      // Primera llamada: busca la linea
      // Segunda llamada: busca la ruta
      mockEm.findOne.mockImplementation(async (entity: any) => {
        if (entity.name === 'LineaProduccion') return { id: 1, rutaPasadaActiva: { id: 1 } };
        return mockRoute;
      });
      mockEm.count.mockResolvedValue(0);

      await expect(
        service.update(1, {
          rutaPasadaActiva: 2,
        } as any)
      ).rejects.toThrow('No se puede asignar una ruta sin etapas a una línea de producción');

      expect(mockEm.findOne).toHaveBeenCalledTimes(2);
    });

    it('throws ValidationError when there are active pasadas on the line during route change', async () => {
      mockEm.findOne.mockImplementation(async (entity: any) => {
        if (entity.name === 'LineaProduccion') return { id: 1, rutaPasadaActiva: { id: 1 } };
        return null;
      });
      // Mock that there is 1 active pasada
      mockEm.count.mockResolvedValue(1);

      await expect(
        service.update(1, {
          rutaPasadaActiva: 2,
        } as any)
      ).rejects.toThrow('No se puede cambiar la ruta mientras haya pasadas en curso en esta línea');

      expect(mockEm.count).toHaveBeenCalledOnce();
    });
  });

  describe('findById', () => {
    it('should find by id and populate rutaPasadaActiva.etapas.etapa', async () => {
      const mockLinea = { id: 1, rutaPasadaActiva: { id: 2 } };
      mockEm.findOne.mockResolvedValue(mockLinea);

      const result = await service.findById(1);

      expect(mockEm.findOne).toHaveBeenCalledWith(expect.anything(), { id: 1 }, { populate: ['rutaPasadaActiva', 'rutaPasadaActiva.etapas', 'rutaPasadaActiva.etapas.etapa', 'dispositivo'] });
      expect(result).toBe(mockLinea);
    });
  });
});
