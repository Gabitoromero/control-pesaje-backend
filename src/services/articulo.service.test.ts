import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArticuloService } from './articulo.service.js';
import { ValidationError } from '../utils/errors.js';

// ─── Mock EntityManager ───────────────────────────────────────────────────────

const mockEm = {
  find: vi.fn(),
  findOne: vi.fn(),
  create: vi.fn(),
  count: vi.fn(),
  flush: vi.fn(),
  persist: vi.fn().mockReturnThis(),
  assign: vi.fn(),
};

vi.mock('@mikro-orm/core', () => ({
  RequestContext: {
    getEntityManager: vi.fn(() => mockEm),
  },
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ArticuloService.create validations', () => {
  let service: ArticuloService;
  beforeEach(() => {
    vi.clearAllMocks();
    service = new ArticuloService();
  });

  it('throws ValidationError when codigo and nombre are duplicated', async () => {
    mockEm.findOne.mockResolvedValueOnce({ id: 2, codigo: 'A1', nombre: 'M1' });

    await expect(
      service.create({
        codigo: 'A1',
        nombre: 'M1',
      } as any)
    ).rejects.toThrow(/already exists/);
  });
});

describe('ArticuloService.update validations', () => {
  let service: ArticuloService;
  beforeEach(() => {
    vi.clearAllMocks();
    service = new ArticuloService();
  });

  it('throws ValidationError when updated to existing codigo and nombre', async () => {
    // first call gets current entity
    mockEm.findOne.mockResolvedValueOnce({ id: 1, codigo: 'Old', nombre: 'M1' });
    // second call finds duplicate
    mockEm.findOne.mockResolvedValueOnce({ id: 2, codigo: 'A1', nombre: 'M1' });

    await expect(
      service.update(1, {
        codigo: 'A1',
      } as any)
    ).rejects.toThrow(/already exists/);
  });
});

describe('ArticuloService.softDelete', () => {
  let service: ArticuloService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ArticuloService();
  });

  it('A) throws RestrictError when article is referenced by an active route pivot', async () => {
    const articuloId = 4;
    // 1 pivot record exists (for an active route)
    mockEm.count.mockResolvedValue(1);

    await expect(service.softDelete(articuloId)).rejects.toThrow(/Cannot delete articulo/);

    // Guard must count WITHOUT filtering by activo
    expect(mockEm.count).toHaveBeenCalledOnce();
    const [, where] = mockEm.count.mock.calls[0];
    expect(where).toMatchObject({ articulo: { id: articuloId } });
    expect(where).not.toHaveProperty('activo');
  });

  it('B) throws RestrictError even when article is referenced only by an inactive route pivot', async () => {
    const articuloId = 5;
    // 1 pivot record exists even though the route is inactive
    mockEm.count.mockResolvedValue(1);

    await expect(service.softDelete(articuloId)).rejects.toThrow(/Cannot delete articulo/);

    const [, where] = mockEm.count.mock.calls[0];
    expect(where).not.toHaveProperty('activo');
  });

  it('C) succeeds when no pivot records reference the article', async () => {
    const articuloId = 3;
    mockEm.count.mockResolvedValue(0);
    mockEm.findOne.mockResolvedValue({ id: articuloId, codigo: 'Articulo Test', activo: true });
    mockEm.flush.mockResolvedValue(undefined);

    const result = await service.softDelete(articuloId);

    expect(result).toBe(true);

    // Count must not filter by activo — any pivot record blocks deletion
    expect(mockEm.count).toHaveBeenCalledOnce();
    const [, where] = mockEm.count.mock.calls[0];
    expect(where).toMatchObject({ articulo: { id: articuloId } });
    expect(where).not.toHaveProperty('activo');
  });
});
