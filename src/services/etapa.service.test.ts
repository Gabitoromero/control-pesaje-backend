import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EtapaService } from './etapa.service.js';

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

describe('EtapaService.softDelete', () => {
  let service: EtapaService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EtapaService();
  });

  // T-12: softDelete succeeds when the only RutaPasadaEtapa refs are inactive
  it('T-12: softDelete returns true when em.count(RutaPasadaEtapa, { etapa: { id }, activo: true }) returns 0', async () => {
    const etapaId = 7;
    // Only inactive refs exist → count of active refs is 0
    mockEm.count.mockResolvedValue(0);
    // findOne (from super.softDelete) resolves the entity
    mockEm.findOne.mockResolvedValue({ id: etapaId, nombre: 'Etapa Test', activo: true });
    mockEm.flush.mockResolvedValue(undefined);

    const result = await service.softDelete(etapaId);

    expect(result).toBe(true);

    // Verify count was called with activo: true (only active refs should block deletion)
    expect(mockEm.count).toHaveBeenCalledOnce();
    const [, where] = mockEm.count.mock.calls[0];
    expect(where).toMatchObject({ etapa: { id: etapaId }, activo: true });
  });

  it('softDelete throws RestrictError when active refs exist', async () => {
    const etapaId = 8;
    mockEm.count.mockResolvedValue(2); // 2 active refs

    await expect(service.softDelete(etapaId)).rejects.toThrow(/Cannot delete etapa/);
  });
});
