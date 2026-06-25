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

  it('A) throws RestrictError when stage is referenced by an active route pivot', async () => {
    const etapaId = 8;
    // 1 pivot record exists (for an active route)
    mockEm.count.mockResolvedValue(1);

    await expect(service.softDelete(etapaId)).rejects.toThrow(/Cannot delete etapa/);

    // Guard must count WITHOUT filtering by activo
    expect(mockEm.count).toHaveBeenCalledOnce();
    const [, where] = mockEm.count.mock.calls[0];
    expect(where).toMatchObject({ etapa: { id: etapaId } });
    expect(where).not.toHaveProperty('activo');
  });

  it('B) throws RestrictError even when stage is referenced only by an inactive route pivot', async () => {
    const etapaId = 9;
    // 1 pivot record exists even though the route is inactive
    mockEm.count.mockResolvedValue(1);

    await expect(service.softDelete(etapaId)).rejects.toThrow(/Cannot delete etapa/);

    const [, where] = mockEm.count.mock.calls[0];
    expect(where).not.toHaveProperty('activo');
  });

  it('C) succeeds when no pivot records reference the stage', async () => {
    const etapaId = 7;
    mockEm.count.mockResolvedValue(0);
    mockEm.findOne.mockResolvedValue({ id: etapaId, nombre: 'Etapa Test', activo: true });
    mockEm.flush.mockResolvedValue(undefined);

    const result = await service.softDelete(etapaId);

    expect(result).toBe(true);

    // Count must not filter by activo — any pivot record blocks deletion
    expect(mockEm.count).toHaveBeenCalledOnce();
    const [, where] = mockEm.count.mock.calls[0];
    expect(where).toMatchObject({ etapa: { id: etapaId } });
    expect(where).not.toHaveProperty('activo');
  });
});
