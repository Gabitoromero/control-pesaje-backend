import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BalanzaService } from './balanza.service.js';
import { ValidationError, RestrictError } from '../utils/errors.js';

// ─── Mock EntityManager ───────────────────────────────────────────────────────

const mockEm = {
  find: vi.fn(),
  findOne: vi.fn(),
  count: vi.fn(),
  flush: vi.fn(),
  persist: vi.fn().mockReturnThis(),
};

vi.mock('@mikro-orm/core', () => ({
  RequestContext: {
    getEntityManager: vi.fn(() => mockEm),
  },
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BalanzaService', () => {
  let service: BalanzaService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BalanzaService();
  });

  describe('create', () => {
    it('throws ValidationError if balanza with the same nombre already exists', async () => {
      mockEm.findOne.mockResolvedValueOnce({ id: 2, nombre: 'Test', activo: true });
      await expect(service.create({ nombre: 'Test' } as any)).rejects.toThrow(ValidationError);
    });
  });

  describe('update', () => {
    it('throws ValidationError if another balanza with the same nombre already exists', async () => {
      mockEm.findOne.mockResolvedValueOnce({ id: 3, nombre: 'Test', activo: true });
      await expect(service.update(1, { nombre: 'Test' } as any)).rejects.toThrow(ValidationError);
    });
  });

  describe('softDelete', () => {
    it('throws RestrictError when balanza is referenced by a LineaProduccion', async () => {
      mockEm.count.mockResolvedValueOnce(1); // lineas
      await expect(service.softDelete(1)).rejects.toThrow(/Cannot delete balanza 1: 1 linea/);
    });

    it('throws RestrictError when balanza is referenced by a Pasada', async () => {
      mockEm.count.mockResolvedValueOnce(0); // lineas
      mockEm.count.mockResolvedValueOnce(1); // pasadas
      await expect(service.softDelete(1)).rejects.toThrow(/Cannot delete balanza 1: 1 pasada/);
    });

    it('succeeds when no records reference the balanza', async () => {
      mockEm.count.mockResolvedValue(0);
      mockEm.findOne.mockResolvedValue({ id: 1, nombre: 'Balanza 1', activo: true });
      mockEm.flush.mockResolvedValue(undefined);

      const result = await service.softDelete(1);
      expect(result).toBe(true);
      expect(mockEm.count).toHaveBeenCalledTimes(2);
    });
  });
});
