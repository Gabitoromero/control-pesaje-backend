import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RutaPasadaService } from './ruta-pasada.service.js';
import { RutaPasadaEtapa } from '../models/RutaPasadaEtapa.js';
import { ValidationError } from '../utils/errors.js';
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

describe('RutaPasadaEtapaCreateSchema — tolerancia por etapa', () => {
  it('accepts an etapa without tolerance fields (existing payloads keep working)', () => {
    expect(RutaPasadaEtapaCreateSchema.safeParse(baseEtapa).success).toBe(true);
  });

  it('accepts any own percentage up to the storage bound (no business cap in the backend, SC-001)', () => {
    for (const toleranciaPct of [0, 12.5, 50, 50.01, 999.99]) {
      const r = RutaPasadaEtapaCreateSchema.safeParse({ ...baseEtapa, toleranciaPorDefecto: false, toleranciaPct });
      expect(r.success).toBe(true);
    }
  });

  it('rejects a negative percentage, one beyond the decimal(5,2) bound, or with more than 2 decimals', () => {
    for (const toleranciaPct of [-1, 1000, 10.123]) {
      const r = RutaPasadaEtapaCreateSchema.safeParse({ ...baseEtapa, toleranciaPorDefecto: false, toleranciaPct });
      expect(r.success).toBe(false);
    }
  });

  it('accepts a null percentage (default tolerance)', () => {
    const r = RutaPasadaEtapaCreateSchema.safeParse({ ...baseEtapa, toleranciaPorDefecto: true, toleranciaPct: null });
    expect(r.success).toBe(true);
  });
});

describe('RutaPasadaService — tolerancia por etapa', () => {
  let service: RutaPasadaService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RutaPasadaService();
    mockEm.create.mockImplementation((entityClass, data) =>
      entityClass.name === 'RutaPasada' ? { id: 1, etapas: { add: vi.fn() } } : { ...data },
    );
  });

  it('create: etapas without tolerance fields default to toleranciaPorDefecto=true and no own percentage', async () => {
    await service.create({ nombre: 'R', etapas: [baseEtapa] } as unknown as CreateInput);
    expect(mockEm.create).toHaveBeenCalledWith(
      RutaPasadaEtapa,
      expect.objectContaining({ etapa: 2, toleranciaPorDefecto: true, toleranciaPct: null }),
    );
  });

  it('create: stores the own percentage when toleranciaPorDefecto is false', async () => {
    await service.create({ nombre: 'R', etapas: [{ ...baseEtapa, toleranciaPorDefecto: false, toleranciaPct: 7.5 }] } as unknown as CreateInput);
    expect(mockEm.create).toHaveBeenCalledWith(
      RutaPasadaEtapa,
      expect.objectContaining({ toleranciaPorDefecto: false, toleranciaPct: 7.5 }),
    );
  });

  it('create: discards the own percentage when toleranciaPorDefecto is true', async () => {
    await service.create({ nombre: 'R', etapas: [{ ...baseEtapa, toleranciaPorDefecto: true, toleranciaPct: 7.5 }] } as unknown as CreateInput);
    expect(mockEm.create).toHaveBeenCalledWith(
      RutaPasadaEtapa,
      expect.objectContaining({ toleranciaPorDefecto: true, toleranciaPct: null }),
    );
  });

  it('create: rejects toleranciaPorDefecto=false without a percentage', async () => {
    await expect(
      service.create({ nombre: 'R', etapas: [{ ...baseEtapa, toleranciaPorDefecto: false }] } as unknown as CreateInput),
    ).rejects.toThrow(ValidationError);
    await expect(
      service.create({ nombre: 'R', etapas: [{ ...baseEtapa, toleranciaPorDefecto: false, toleranciaPct: null }] } as unknown as CreateInput),
    ).rejects.toThrow(/toleranciaPct/);
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

    it('re-checking "por defecto" on an existing etapa clears the own percentage', async () => {
      const existing = [{ id: 10, etapa: { id: 2 }, toleranciaPorDefecto: false, toleranciaPct: 8 }];
      mockEm.findOne.mockResolvedValue(buildRuta(existing));

      await service.update(1, { etapas: [{ id: 10, ...baseEtapa, toleranciaPorDefecto: true, toleranciaPct: 8 }] } as unknown as UpdateInput);

      expect(mockEm.assign).toHaveBeenCalledWith(
        existing[0],
        expect.objectContaining({ toleranciaPorDefecto: true }),
        { convertCustomTypes: true },
      );
      expect(existing[0].toleranciaPct).toBeNull();
    });

    // convertCustomTypes runs DecimalType.convertToJSValue, which turns null into the string 'null' (numeric cast error, HTTP 500)
    it('never routes toleranciaPct through assign, so a null cannot be stringified by the decimal type', async () => {
      const existing = [{ id: 10, etapa: { id: 2 }, toleranciaPorDefecto: false, toleranciaPct: 8 }];
      mockEm.findOne.mockResolvedValue(buildRuta(existing));

      await service.update(1, { etapas: [{ id: 10, ...baseEtapa, toleranciaPorDefecto: true }] } as unknown as UpdateInput);

      const assigned = mockEm.assign.mock.calls.find((c) => c[0] === existing[0])![1];
      expect(assigned).not.toHaveProperty('toleranciaPct');
    });

    it('sets an own percentage on an existing etapa', async () => {
      const existing = [{ id: 10, etapa: { id: 2 }, toleranciaPorDefecto: true, toleranciaPct: null }];
      mockEm.findOne.mockResolvedValue(buildRuta(existing));

      await service.update(1, { etapas: [{ id: 10, ...baseEtapa, toleranciaPorDefecto: false, toleranciaPct: 15 }] } as unknown as UpdateInput);

      expect(mockEm.assign).toHaveBeenCalledWith(
        existing[0],
        expect.objectContaining({ toleranciaPorDefecto: false }),
        { convertCustomTypes: true },
      );
      expect(existing[0].toleranciaPct).toBe(15);
    });

    it('an update payload without tolerance fields leaves the stored tolerance untouched', async () => {
      const existing = [{ id: 10, etapa: { id: 2 }, toleranciaPorDefecto: false, toleranciaPct: 8 }];
      mockEm.findOne.mockResolvedValue(buildRuta(existing));

      await service.update(1, { etapas: [{ id: 10, ...baseEtapa }] } as unknown as UpdateInput);

      const assigned = mockEm.assign.mock.calls.find((c) => c[0] === existing[0])![1];
      expect(assigned).not.toHaveProperty('toleranciaPorDefecto');
      expect(assigned).not.toHaveProperty('toleranciaPct');
    });

    it('rejects toleranciaPorDefecto=false without a percentage', async () => {
      mockEm.findOne.mockResolvedValue(buildRuta([]));
      await expect(
        service.update(1, { etapas: [{ ...baseEtapa, toleranciaPorDefecto: false }] } as unknown as UpdateInput),
      ).rejects.toThrow(ValidationError);
    });
  });
});
