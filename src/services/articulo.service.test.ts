import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArticuloService } from './articulo.service.js';

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

describe('ArticuloService.softDelete', () => {
  let service: ArticuloService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ArticuloService();
  });

  // T-13: softDelete succeeds when the only ArticuloRutaPasada refs are inactive
  it('T-13: softDelete returns true when em.count(ArticuloRutaPasada, { articulo: { id }, activo: true }) returns 0', async () => {
    const articuloId = 3;
    // Only inactive refs exist → count of active refs is 0
    mockEm.count.mockResolvedValue(0);
    // findOne (from super.softDelete) resolves the entity
    mockEm.findOne.mockResolvedValue({ id: articuloId, nombre: 'Articulo Test', activo: true });
    mockEm.flush.mockResolvedValue(undefined);

    const result = await service.softDelete(articuloId);

    expect(result).toBe(true);

    // Verify count was called with activo: true (only active refs should block deletion)
    expect(mockEm.count).toHaveBeenCalledOnce();
    const [, where] = mockEm.count.mock.calls[0];
    expect(where).toMatchObject({ articulo: { id: articuloId }, activo: true });
  });

  it('softDelete throws RestrictError when active refs exist', async () => {
    const articuloId = 4;
    mockEm.count.mockResolvedValue(3); // 3 active refs

    await expect(service.softDelete(articuloId)).rejects.toThrow(/Cannot delete articulo/);
  });
});
