import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RutaPasadaService } from './ruta-pasada.service.js';
import { RutaPasadaEtapa } from '../models/RutaPasadaEtapa.js';
import { AtributoEtapaRuta } from '../models/AtributoEtapaRuta.js';
import { RutaPasadaCreateSchema, RutaPasadaUpdateSchema, RutaPasadaEtapaCreateSchema } from '../shared/schemas.js';
import { ValidationError } from '../utils/errors.js';

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
const temperatura = { nombre: 'Temperatura (°C)', tipo: 'numerico', minimo: 0, maximo: 99 };
const degustacion = { nombre: 'Degustación', tipo: 'aceptado' };

type CreateInput = Parameters<RutaPasadaService['create']>[0];
type UpdateInput = Parameters<RutaPasadaService['update']>[1];

describe('RutaPasadaEtapaCreateSchema — atributos', () => {
  it('accepts numeric and aceptado atributos, and an etapa without atributos', () => {
    expect(RutaPasadaEtapaCreateSchema.safeParse(baseEtapa).success).toBe(true);
    const r = RutaPasadaEtapaCreateSchema.safeParse({ ...baseEtapa, atributos: [temperatura, degustacion] });
    expect(r.success).toBe(true);
    expect(r.data?.atributos).toHaveLength(2);
  });

  it('flows through the ruta create and update schemas (nested etapas)', () => {
    const etapas = [{ ...baseEtapa, atributos: [temperatura] }];
    expect(RutaPasadaCreateSchema.safeParse({ nombre: 'R', etapas }).data?.etapas?.[0].atributos).toHaveLength(1);
    expect(RutaPasadaUpdateSchema.safeParse({ etapas }).data?.etapas?.[0].atributos).toHaveLength(1);
  });

  it('rejects more than 2 atributos per etapa', () => {
    const tres = [temperatura, degustacion, { ...temperatura, nombre: 'Altura' }];
    expect(RutaPasadaEtapaCreateSchema.safeParse({ ...baseEtapa, atributos: tres }).success).toBe(false);
  });

  it('rejects an unknown tipo and an empty nombre', () => {
    expect(RutaPasadaEtapaCreateSchema.safeParse({ ...baseEtapa, atributos: [{ ...temperatura, tipo: 'texto' }] }).success).toBe(false);
    expect(RutaPasadaEtapaCreateSchema.safeParse({ ...baseEtapa, atributos: [{ ...temperatura, nombre: '  ' }] }).success).toBe(false);
  });
});

describe('RutaPasadaService — atributos', () => {
  let service: RutaPasadaService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RutaPasadaService();
    mockEm.create.mockImplementation((entityClass, data) =>
      entityClass.name === 'RutaPasada' ? { id: 1, etapas: { add: vi.fn() } } : { ...data },
    );
  });

  const createWith = (atributos: unknown[]) =>
    service.create({ nombre: 'R', etapas: [{ ...baseEtapa, atributos }] } as unknown as CreateInput);

  describe('create', () => {
    it('creates the atributos linked to their etapa and keeps them out of the etapa data', async () => {
      await createWith([temperatura]);

      const etapaCall = mockEm.create.mock.calls.find(([cls]) => cls === RutaPasadaEtapa);
      expect(etapaCall?.[1]).not.toHaveProperty('atributos');
      const pivot = mockEm.create.mock.results[mockEm.create.mock.calls.findIndex(([cls]) => cls === RutaPasadaEtapa)].value;
      expect(mockEm.create).toHaveBeenCalledWith(
        AtributoEtapaRuta,
        expect.objectContaining({ nombre: 'Temperatura (°C)', tipo: 'numerico', minimo: 0, maximo: 99, rutaPasadaEtapa: pivot }),
      );
    });

    it('fixes an aceptado atributo to the range 1..1 whatever was sent', async () => {
      await createWith([{ ...degustacion, minimo: 5, maximo: 9 }]);
      expect(mockEm.create).toHaveBeenCalledWith(AtributoEtapaRuta, expect.objectContaining({ tipo: 'aceptado', minimo: 1, maximo: 1 }));
    });

    it('trims the nombre', async () => {
      await createWith([{ ...temperatura, nombre: '  Altura  ' }]);
      expect(mockEm.create).toHaveBeenCalledWith(AtributoEtapaRuta, expect.objectContaining({ nombre: 'Altura' }));
    });

    it('accepts minimo equal to maximo', async () => {
      await createWith([{ ...temperatura, minimo: 5, maximo: 5 }]);
      expect(mockEm.create).toHaveBeenCalledWith(AtributoEtapaRuta, expect.objectContaining({ minimo: 5, maximo: 5 }));
    });

    it('rejects minimo greater than maximo', async () => {
      await expect(createWith([{ ...temperatura, minimo: 10, maximo: 5 }])).rejects.toBeInstanceOf(ValidationError);
    });

    it('rejects a numerico atributo without a full range (only minimo or only maximo)', async () => {
      await expect(createWith([{ nombre: 'X', tipo: 'numerico', minimo: 1 }])).rejects.toBeInstanceOf(ValidationError);
      await expect(createWith([{ nombre: 'X', tipo: 'numerico', maximo: 1 }])).rejects.toBeInstanceOf(ValidationError);
    });

    it('rejects more than 2 atributos and repeated nombres within an etapa', async () => {
      await expect(createWith([temperatura, degustacion, { ...temperatura, nombre: 'Otra' }])).rejects.toBeInstanceOf(ValidationError);
      await expect(createWith([temperatura, { ...temperatura, nombre: ' temperatura (°c) ' }])).rejects.toBeInstanceOf(ValidationError);
    });

    it('an etapa without atributos creates none (previous behavior)', async () => {
      await service.create({ nombre: 'R', etapas: [baseEtapa] } as unknown as CreateInput);
      expect(mockEm.create).not.toHaveBeenCalledWith(AtributoEtapaRuta, expect.anything());
    });
  });

  describe('update', () => {
    const atributo = (id: number, extra = {}) => ({ id, nombre: `A${id}`, tipo: 'numerico', minimo: 0, maximo: 10, activo: true, ...extra });
    const buildRuta = (pivots: Array<{ id: number; etapa: { id: number }; atributos: unknown[] }>) => ({
      id: 1,
      etapas: {
        getItems: vi.fn(() => pivots.map((p) => ({ ...p, atributos: { init: async () => ({ getItems: () => p.atributos }), getItems: () => p.atributos } }))),
        init: vi.fn().mockImplementation(async function (this: unknown) { return this; }),
        add: vi.fn(),
      },
    });

    it('omitted atributos keep the stored ones untouched', async () => {
      const a = atributo(100);
      mockEm.findOne.mockResolvedValue(buildRuta([{ id: 10, etapa: { id: 2 }, atributos: [a] }]));

      await service.update(1, { etapas: [{ ...baseEtapa, id: 10 }] } as unknown as UpdateInput);

      expect(a.activo).toBe(true);
      expect(mockEm.create).not.toHaveBeenCalledWith(AtributoEtapaRuta, expect.anything());
    });

    it('syncs by id: edits the sent one, creates the new one, deactivates the missing one', async () => {
      const keep = atributo(100);
      const gone = atributo(101);
      mockEm.findOne.mockResolvedValue(buildRuta([{ id: 10, etapa: { id: 2 }, atributos: [keep, gone] }]));

      await service.update(1, {
        etapas: [{ ...baseEtapa, id: 10, atributos: [{ id: 100, nombre: 'Renombrada', tipo: 'numerico', minimo: 1, maximo: 20 }, degustacion] }],
      } as unknown as UpdateInput);

      expect(mockEm.assign).toHaveBeenCalledWith(keep, expect.objectContaining({ nombre: 'Renombrada', minimo: 1, maximo: 20 }), expect.objectContaining({ convertCustomTypes: true }));
      expect(mockEm.create).toHaveBeenCalledWith(AtributoEtapaRuta, expect.objectContaining({ nombre: 'Degustación', minimo: 1, maximo: 1 }));
      expect(gone.activo).toBe(false);
      expect(keep.activo).toBe(true);
      expect(mockEm.remove).not.toHaveBeenCalled();
    });

    it('an empty array deactivates every atributo of the etapa', async () => {
      const a = atributo(100);
      mockEm.findOne.mockResolvedValue(buildRuta([{ id: 10, etapa: { id: 2 }, atributos: [a] }]));

      await service.update(1, { etapas: [{ ...baseEtapa, id: 10, atributos: [] }] } as unknown as UpdateInput);

      expect(a.activo).toBe(false);
    });

    it('rejects an atributo id that does not belong to the etapa', async () => {
      mockEm.findOne.mockResolvedValue(buildRuta([{ id: 10, etapa: { id: 2 }, atributos: [atributo(100)] }]));

      await expect(
        service.update(1, { etapas: [{ ...baseEtapa, id: 10, atributos: [{ ...temperatura, id: 999 }] }] } as unknown as UpdateInput),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('refuses to remove an etapa that has atributos, active or deactivated, and never deletes them', async () => {
      const inactive = atributo(100, { activo: false });
      mockEm.findOne.mockResolvedValue(buildRuta([{ id: 10, etapa: { id: 2 }, atributos: [inactive] }]));

      await expect(service.update(1, { etapas: [] } as unknown as UpdateInput)).rejects.toBeInstanceOf(ValidationError);
      expect(mockEm.remove).not.toHaveBeenCalled();
    });

    it('removes an etapa that has no atributos (previous behavior)', async () => {
      mockEm.findOne.mockResolvedValue(buildRuta([{ id: 10, etapa: { id: 2 }, atributos: [] }]));

      await service.update(1, { etapas: [] } as unknown as UpdateInput);

      expect(mockEm.remove).toHaveBeenCalledWith(expect.objectContaining({ id: 10 }));
    });
  });
});
