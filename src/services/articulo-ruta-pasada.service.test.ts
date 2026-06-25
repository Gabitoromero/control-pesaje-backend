import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArticuloRutaPasadaService } from './articulo-ruta-pasada.service.js';
import { ArticuloRutaPasada } from '../models/ArticuloRutaPasada.js';

// ─── Mock EntityManager ───────────────────────────────────────────────────────

const mockEm = {
  find: vi.fn(),
  findOne: vi.fn(),
  count: vi.fn(),
  flush: vi.fn(),
  create: vi.fn(),
  removeAndFlush: vi.fn(),
  remove: vi.fn(),
  persist: vi.fn().mockReturnThis(),
};

vi.mock('@mikro-orm/core', () => ({
  RequestContext: {
    getEntityManager: vi.fn(() => mockEm),
  },
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ArticuloRutaPasadaService', () => {
  let service: ArticuloRutaPasadaService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ArticuloRutaPasadaService();
  });

  describe('findAll', () => {
    it('queries without any activo filter', async () => {
      mockEm.find.mockResolvedValue([]);

      await service.findAll();

      expect(mockEm.find).toHaveBeenCalledOnce();
      const [, where] = mockEm.find.mock.calls[0];
      // Must not contain an activo filter
      expect(where).not.toHaveProperty('activo');
    });

    it('filters by rutaPasadaId when provided, without activo filter', async () => {
      mockEm.find.mockResolvedValue([]);

      await service.findAll(5);

      expect(mockEm.find).toHaveBeenCalledOnce();
      const [, where] = mockEm.find.mock.calls[0];
      expect(where).toMatchObject({ rutaPasada: 5 });
      expect(where).not.toHaveProperty('activo');
    });
  });

  describe('findOne', () => {
    it('queries by id without any activo filter', async () => {
      const pivot = { id: 1, articulo: { id: 2 } };
      mockEm.findOne.mockResolvedValue(pivot);

      const result = await service.findOne(1);

      expect(mockEm.findOne).toHaveBeenCalledOnce();
      const [, where] = mockEm.findOne.mock.calls[0];
      expect(where).toMatchObject({ id: 1 });
      expect(where).not.toHaveProperty('activo');
      expect(result).toBe(pivot);
    });

    it('returns null when not found', async () => {
      mockEm.findOne.mockResolvedValue(null);

      const result = await service.findOne(99);

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('creates a pivot record without setting activo', async () => {
      const payload = { rutaPasada: 1, articulo: 2 };
      const created = { id: 1, ...payload };
      mockEm.create.mockReturnValue(created);

      const result = await service.create(payload as any);

      expect(mockEm.create).toHaveBeenCalledWith(ArticuloRutaPasada, payload);
      expect(mockEm.flush).toHaveBeenCalledOnce();
      expect(result).toBe(created);
      // Must not include activo field in the created payload
      expect(mockEm.create.mock.calls[0][1]).not.toHaveProperty('activo');
    });
  });

  describe('remove', () => {
    it('hard-deletes the record via em.remove + flush (physical row removal)', async () => {
      const pivot = { id: 1, articulo: { id: 2 } };
      mockEm.findOne.mockResolvedValue(pivot);

      await service.remove(1);

      // Hard delete: must call em.remove (then em.flush), NOT set activo = false
      expect(mockEm.remove).toHaveBeenCalledWith(pivot);
      expect(mockEm.flush).toHaveBeenCalledOnce();
      expect(pivot).not.toHaveProperty('activo', false);
    });

    it('returns false when record not found', async () => {
      mockEm.findOne.mockResolvedValue(null);

      const result = await service.remove(99);

      expect(result).toBe(false);
      expect(mockEm.remove).not.toHaveBeenCalled();
    });
  });
});
