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
    it('succeeds when rutaPasadaActiva is null/undefined', async () => {
      mockEm.create.mockReturnValue({ id: 1 });
      mockEm.flush.mockResolvedValue(undefined);

      const result = await service.create({
        nombre: 'Linea 1',
        numeroBalanza: 1,
        rutaPasadaActiva: null,
      } as any);

      expect(result).toBeDefined();
      expect(mockEm.findOne).not.toHaveBeenCalled();
    });

    it('throws ValidationError when rutaPasadaActiva does not exist or is inactive', async () => {
      mockEm.findOne.mockResolvedValue(null);

      await expect(
        service.create({
          nombre: 'Linea 1',
          numeroBalanza: 1,
          rutaPasadaActiva: 999,
        } as any)
      ).rejects.toThrow(ValidationError);

      expect(mockEm.findOne).toHaveBeenCalledOnce();
    });

    it('throws ValidationError when rutaPasadaActiva has 0 stages', async () => {
      const mockRoute = {
        id: 2,
        activo: true,
        etapas: { length: 0 },
      };
      mockEm.findOne.mockResolvedValue(mockRoute);

      await expect(
        service.create({
          nombre: 'Linea 1',
          numeroBalanza: 1,
          rutaPasadaActiva: 2,
        } as any)
      ).rejects.toThrow('No se puede asignar una ruta sin etapas a una línea de producción');

      expect(mockEm.findOne).toHaveBeenCalledOnce();
    });

    it('succeeds when rutaPasadaActiva is active and has >= 1 stage', async () => {
      const mockRoute = {
        id: 3,
        activo: true,
        etapas: { length: 1 },
      };
      mockEm.findOne.mockResolvedValue(mockRoute);
      mockEm.create.mockReturnValue({ id: 1, rutaPasadaActiva: mockRoute });
      mockEm.flush.mockResolvedValue(undefined);

      const result = await service.create({
        nombre: 'Linea 1',
        numeroBalanza: 1,
        rutaPasadaActiva: 3,
      } as any);

      expect(result).toBeDefined();
      expect(mockEm.findOne).toHaveBeenCalledOnce();
    });
  });

  describe('update validations', () => {
    it('throws ValidationError when updated rutaPasadaActiva has 0 stages', async () => {
      const mockRoute = {
        id: 2,
        activo: true,
        etapas: { length: 0 },
      };
      mockEm.findOne.mockResolvedValue(mockRoute);

      await expect(
        service.update(1, {
          rutaPasadaActiva: 2,
        } as any)
      ).rejects.toThrow('No se puede asignar una ruta sin etapas a una línea de producción');

      expect(mockEm.findOne).toHaveBeenCalledOnce();
    });
  });

  describe('findById', () => {
    it('should find by id and populate rutaPasadaActiva', async () => {
      const mockLinea = { id: 1, rutaPasadaActiva: { id: 2 } };
      mockEm.findOne.mockResolvedValue(mockLinea);

      const result = await service.findById(1);

      expect(mockEm.findOne).toHaveBeenCalledWith(expect.anything(), { id: 1 }, { populate: ['rutaPasadaActiva'] });
      expect(result).toBe(mockLinea);
    });
  });
});
