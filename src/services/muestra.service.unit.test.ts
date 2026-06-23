import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MuestraService } from './muestra.service.js';

// Mock EntityManager — only the methods hardDelete needs
const mockEm = {
  findOne: vi.fn(),
  remove: vi.fn(),
  flush: vi.fn(),
};

vi.mock('@mikro-orm/core', () => ({
  RequestContext: {
    getEntityManager: vi.fn(() => mockEm),
  },
}));

describe('MuestraService.hardDelete', () => {
  let service: MuestraService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MuestraService();
  });

  it('returns true and calls remove and flush when muestra is found', async () => {
    const fakeMustra = { id: 1, activo: true };
    mockEm.findOne.mockResolvedValue(fakeMustra);
    mockEm.remove.mockResolvedValue(undefined);
    mockEm.flush.mockResolvedValue(undefined);

    const result = await service.hardDelete(1);

    expect(result).toBe(true);
    expect(mockEm.remove).toHaveBeenCalledWith(fakeMustra);
    expect(mockEm.flush).toHaveBeenCalled();
  });

  it('returns false when muestra is not found (findOne returns null)', async () => {
    mockEm.findOne.mockResolvedValue(null);

    const result = await service.hardDelete(99);

    expect(result).toBe(false);
    expect(mockEm.remove).not.toHaveBeenCalled();
    expect(mockEm.flush).not.toHaveBeenCalled();
  });

  it('calls em.remove and flush with the exact found entity reference', async () => {
    const fakeMustra = { id: 5, pesoNeto: 50, activo: true };
    mockEm.findOne.mockResolvedValue(fakeMustra);
    mockEm.remove.mockResolvedValue(undefined);
    mockEm.flush.mockResolvedValue(undefined);

    await service.hardDelete(5);

    expect(mockEm.remove).toHaveBeenCalledTimes(1);
    expect(mockEm.remove).toHaveBeenCalledWith(fakeMustra);
    expect(mockEm.flush).toHaveBeenCalledTimes(1);
  });
});
