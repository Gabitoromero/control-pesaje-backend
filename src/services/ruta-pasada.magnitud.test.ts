import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RutaPasadaService } from './ruta-pasada.service.js';
import { RutaPasadaEtapa } from '../models/RutaPasadaEtapa.js';
import { RutaPasadaEtapaCreateSchema } from '../shared/schemas.js';

const mockEm = {
  find: vi.fn(),
  findOne: vi.fn(),
  count: vi.fn(),
  flush: vi.fn(),
  create: vi.fn(),
  assign: vi.fn(),
  remove: vi.fn(),
  transactional: vi.fn(async (cb) => cb(mockEm)),
};

vi.mock('@mikro-orm/core', () => ({
  RequestContext: { getEntityManager: vi.fn(() => mockEm) },
}));

const baseEtapa = { etapa: 2, orden: 1, pesoIdeal: 10, pesoMinimo: 9, pesoMaximo: 11, cantidadMuestrasRequeridas: 5 };

type CreateInput = Parameters<RutaPasadaService['create']>[0];
type UpdateInput = Parameters<RutaPasadaService['update']>[1];

describe('RutaPasadaEtapaCreateSchema — magnitud', () => {
  it('accepts peso and volumen, and keeps the value in the parsed output', () => {
    for (const magnitud of ['peso', 'volumen']) {
      const r = RutaPasadaEtapaCreateSchema.safeParse({ ...baseEtapa, magnitud });
      expect(r.success).toBe(true);
      expect(r.data).toMatchObject({ magnitud });
    }
  });

  it('accepts an etapa without magnitud (existing payloads keep working)', () => {
    expect(RutaPasadaEtapaCreateSchema.safeParse(baseEtapa).success).toBe(true);
  });

  it('rejects an unknown magnitud', () => {
    for (const magnitud of ['litros', '', null, 1]) {
      expect(RutaPasadaEtapaCreateSchema.safeParse({ ...baseEtapa, magnitud }).success).toBe(false);
    }
  });
});

describe('RutaPasadaService — magnitud', () => {
  let service: RutaPasadaService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RutaPasadaService();
    mockEm.create.mockImplementation((entityClass, data) =>
      entityClass.name === 'RutaPasada' ? { id: 1, etapas: { add: vi.fn() } } : { ...data },
    );
  });

  it('create: an etapa without magnitud defaults to peso', async () => {
    await service.create({ nombre: 'R', etapas: [baseEtapa] } as unknown as CreateInput);
    expect(mockEm.create).toHaveBeenCalledWith(RutaPasadaEtapa, expect.objectContaining({ etapa: 2, magnitud: 'peso' }));
  });

  it('create: stores volumen when sent', async () => {
    await service.create({ nombre: 'R', etapas: [{ ...baseEtapa, magnitud: 'volumen' }] } as unknown as CreateInput);
    expect(mockEm.create).toHaveBeenCalledWith(RutaPasadaEtapa, expect.objectContaining({ magnitud: 'volumen' }));
  });

  describe('update', () => {
    const buildRuta = (existing: unknown[]) => ({
      id: 1,
      etapas: {
        getItems: vi.fn(() => existing),
        init: vi.fn().mockImplementation(async function (this: unknown) { return this; }),
        add: vi.fn(),
      },
    });

    it('changes the magnitud of an existing etapa', async () => {
      const existing = [{ id: 10, etapa: { id: 2 }, magnitud: 'peso' }];
      mockEm.findOne.mockResolvedValue(buildRuta(existing));

      await service.update(1, { etapas: [{ ...baseEtapa, id: 10, magnitud: 'volumen' }] } as unknown as UpdateInput);

      expect(mockEm.assign).toHaveBeenCalledWith(existing[0], expect.objectContaining({ magnitud: 'volumen' }), expect.anything());
    });

    it('an update payload without magnitud leaves the stored magnitud untouched', async () => {
      const existing = [{ id: 10, etapa: { id: 2 }, magnitud: 'volumen' }];
      mockEm.findOne.mockResolvedValue(buildRuta(existing));

      await service.update(1, { etapas: [{ ...baseEtapa, id: 10 }] } as unknown as UpdateInput);

      const assigned = mockEm.assign.mock.calls.find(([target]) => target === existing[0])?.[1];
      expect(assigned).toBeDefined();
      expect(assigned).not.toHaveProperty('magnitud');
      expect(existing[0].magnitud).toBe('volumen');
    });

    it('an etapa added on update without magnitud defaults to peso', async () => {
      mockEm.findOne.mockResolvedValue(buildRuta([]));

      await service.update(1, { etapas: [baseEtapa] } as unknown as UpdateInput);

      expect(mockEm.create).toHaveBeenCalledWith(RutaPasadaEtapa, expect.objectContaining({ etapa: 2, magnitud: 'peso' }));
    });
  });
});
