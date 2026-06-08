import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseService } from './base.service.js';

// ─── Stub entity ─────────────────────────────────────────────────────────────

class TestEntity {
  id: number = 0;
  activo: boolean = true;
}

// ─── Concrete subclass ────────────────────────────────────────────────────────

class TestService extends BaseService<TestEntity> {
  constructor() {
    super(TestEntity as any);
  }
}

// ─── Mock EntityManager ───────────────────────────────────────────────────────

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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BaseService', () => {
  let service: TestService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TestService();
  });

  // T-01: findAll() calls em.find with { activo: true }
  it('T-01: findAll() calls em.find with { activo: true }', async () => {
    const active = [{ id: 1, activo: true }, { id: 2, activo: true }];
    mockEm.find.mockResolvedValue(active);

    const result = await service.findAll();

    expect(mockEm.find).toHaveBeenCalledOnce();
    const [entityClass, where] = mockEm.find.mock.calls[0];
    expect(entityClass).toBe(TestEntity);
    expect(where).toMatchObject({ activo: true });
    expect(result).toEqual(active);
  });

  // T-02: findAllInactive() calls em.find with { activo: false }
  it('T-02: findAllInactive() calls em.find with { activo: false }', async () => {
    const inactive = [{ id: 3, activo: false }];
    mockEm.find.mockResolvedValue(inactive);

    const result = await service.findAllInactive();

    expect(mockEm.find).toHaveBeenCalledOnce();
    const [entityClass, where] = mockEm.find.mock.calls[0];
    expect(entityClass).toBe(TestEntity);
    expect(where).toMatchObject({ activo: false });
    expect(result).toEqual(inactive);
  });

  // T-03: findById(5) returns entity when findOne resolves { id: 5, activo: false }
  // — WHERE arg must NOT contain activo key
  it('T-03: findById(5) returns entity; WHERE has no activo key', async () => {
    const entity = { id: 5, activo: false };
    mockEm.findOne.mockResolvedValue(entity);

    const result = await service.findById(5);

    expect(result).toEqual(entity);
    expect(mockEm.findOne).toHaveBeenCalledOnce();
    const [entityClass, where] = mockEm.findOne.mock.calls[0];
    expect(entityClass).toBe(TestEntity);
    expect(where).not.toHaveProperty('activo');
    expect(where).toMatchObject({ id: 5 });
  });

  // T-04: findById(99) returns null when findOne resolves null
  it('T-04: findById(99) returns null when entity does not exist', async () => {
    mockEm.findOne.mockResolvedValue(null);

    const result = await service.findById(99);

    expect(result).toBeNull();
  });

  // T-05: findAllInactive() returns [] without throwing when em.find resolves []
  it('T-05: findAllInactive() returns [] when no inactive records exist', async () => {
    mockEm.find.mockResolvedValue([]);

    const result = await service.findAllInactive();

    expect(result).toEqual([]);
    expect(mockEm.find).toHaveBeenCalledOnce();
  });
});
