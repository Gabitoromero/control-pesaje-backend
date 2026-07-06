import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RutaPasadaService } from './ruta-pasada.service.js';
import { RutaPasadaEtapa } from '../models/RutaPasadaEtapa.js';
import { ValidationError } from '../utils/errors.js';

// Mock EntityManager
const mockEm = {
  find: vi.fn(),
  findOne: vi.fn(),
  count: vi.fn(),
  flush: vi.fn(),
  persist: vi.fn().mockReturnThis(),
  create: vi.fn(),
  assign: vi.fn(),
  remove: vi.fn(),
  transactional: vi.fn(async (cb) => {
    return cb(mockEm); // execute the callback with the same mockEm
  }),
};

vi.mock('@mikro-orm/core', () => ({
  RequestContext: {
    getEntityManager: vi.fn(() => mockEm),
  },
}));

describe('RutaPasadaService', () => {
  let service: RutaPasadaService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RutaPasadaService();
  });

  describe('create', () => {
    it('throws ValidationError if ruta with the same nombre already exists', async () => {
      mockEm.findOne.mockResolvedValueOnce({ id: 2, nombre: 'Test', activo: true });
      await expect(service.create({ nombre: 'Test' } as any)).rejects.toThrow(ValidationError);
      
      mockEm.findOne.mockResolvedValueOnce({ id: 2, nombre: 'Test', activo: true });
      await expect(service.create({ nombre: 'Test' } as any)).rejects.toThrow(/Ya existe una ruta con el nombre 'Test'/);
    });

    it('creates RutaPasada and its nested etapas within a transaction', async () => {
      const payload = {
        nombre: 'Ruta 1',
        etapas: [
          { etapa: 2, orden: 1, pesoIdeal: 10, pesoMinimo: 9, pesoMaximo: 11, cantidadMuestrasRequeridas: 5 },
        ],
      };

      const rutaMock = { id: 1, nombre: 'Ruta 1', etapas: { add: vi.fn() } };
      mockEm.create.mockImplementation((entityClass, data) => {
        if (entityClass.name === 'RutaPasada') return rutaMock;
        if (entityClass.name === 'RutaPasadaEtapa') return { ...data };
      });

      const result = await service.create(payload as any);

      expect(mockEm.transactional).toHaveBeenCalledOnce();
      expect(mockEm.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ nombre: 'Ruta 1' }));
      expect(mockEm.create).toHaveBeenCalledWith(RutaPasadaEtapa, expect.objectContaining({ etapa: 2 }));
      expect(rutaMock.etapas.add).toHaveBeenCalledOnce();
      expect(mockEm.flush).toHaveBeenCalledOnce();
      expect(result).toBe(rutaMock);
    });
  });

  describe('update', () => {
    it('throws ValidationError if another ruta with the same nombre already exists', async () => {
      mockEm.findOne.mockResolvedValueOnce({ id: 3, nombre: 'Test', activo: true });
      await expect(service.update(1, { nombre: 'Test' } as any)).rejects.toThrow(ValidationError);
      
      mockEm.findOne.mockResolvedValueOnce({ id: 3, nombre: 'Test', activo: true });
      await expect(service.update(1, { nombre: 'Test' } as any)).rejects.toThrow(/Ya existe una ruta con el nombre 'Test'/);
    });

    it('updates RutaPasada and reconciles its nested etapas within a transaction', async () => {
      const payload = {
        nombre: 'Ruta 1 Updated',
        etapas: [
          { id: 10, etapa: 2, orden: 1, pesoIdeal: 15, pesoMinimo: 9, pesoMaximo: 11, cantidadMuestrasRequeridas: 5 }, // Update
          { etapa: 3, orden: 2, pesoIdeal: 5, pesoMinimo: 4, pesoMaximo: 6, cantidadMuestrasRequeridas: 2 }, // Create
        ],
      };

      const existingEtapas = [
        { id: 10, etapa: 2, orden: 1, pesoIdeal: 10, activo: true },
        { id: 11, etapa: 4, orden: 2, pesoIdeal: 20, activo: true }, // To be deleted
      ];

      const rutaMock = { 
        id: 1, 
        nombre: 'Ruta 1', 
        etapas: { 
          getItems: vi.fn(() => existingEtapas),
          init: vi.fn().mockImplementation(async function(this: any) { return this; }),
          add: vi.fn(),
        } 
      };

      mockEm.findOne.mockResolvedValue(rutaMock);
      mockEm.create.mockReturnValue({ isNew: true });

      const result = await service.update(1, payload as any);

      expect(mockEm.transactional).toHaveBeenCalledOnce();
      expect(mockEm.assign).toHaveBeenCalledWith(existingEtapas[0], expect.objectContaining({ pesoIdeal: 15 }), { convertCustomTypes: true });
      expect(mockEm.remove).toHaveBeenCalledWith(existingEtapas[1]); // hard deleted from pivot
      expect(mockEm.create).toHaveBeenCalledWith(RutaPasadaEtapa, expect.objectContaining({ etapa: 3 }));
      expect(mockEm.flush).toHaveBeenCalledOnce();
      expect(result).toBe(rutaMock);
    });

    it('reorders etapas when same etapas are sent with swapped orden', async () => {
      const payload = {
        etapas: [
          { etapa: 2, orden: 1, pesoIdeal: 35, pesoMinimo: 30, pesoMaximo: 40, cantidadMuestrasRequeridas: 1 },
          { etapa: 1, orden: 2, pesoIdeal: 15, pesoMinimo: 10, pesoMaximo: 20, cantidadMuestrasRequeridas: 2 },
        ],
      };

      const existingEtapas = [
        { id: 10, etapa: { id: 1 }, orden: 1, pesoIdeal: 15, activo: true },
        { id: 11, etapa: { id: 2 }, orden: 2, pesoIdeal: 35, activo: true },
      ];

      const rutaMock = {
        id: 1,
        etapas: {
          getItems: vi.fn(() => existingEtapas),
          init: vi.fn().mockImplementation(async function(this: any) { return this; }),
          add: vi.fn(),
        },
      };

      mockEm.findOne.mockResolvedValue(rutaMock);

      await service.update(1, payload as any);

      // etapa FK 2 → matched by existingByEtapaId, assigned orden: 1
      expect(mockEm.assign).toHaveBeenCalledWith(existingEtapas[1], expect.objectContaining({ etapa: 2, orden: 1 }), { convertCustomTypes: true });
      // etapa FK 1 → matched by existingByEtapaId, assigned orden: 2
      expect(mockEm.assign).toHaveBeenCalledWith(existingEtapas[0], expect.objectContaining({ etapa: 1, orden: 2 }), { convertCustomTypes: true });
      expect(mockEm.remove).not.toHaveBeenCalled();
      expect(mockEm.create).not.toHaveBeenCalled();
    });

    it('replaces an etapa FK — hard deletes old pivot, creates new one', async () => {
      const payload = {
        etapas: [
          // etapa 3 replaces etapa 2 in slot 1
          { etapa: 3, orden: 1, pesoIdeal: 10, pesoMinimo: 9, pesoMaximo: 11, cantidadMuestrasRequeridas: 5 },
        ],
      };

      const existingEtapas = [
        { id: 10, etapa: { id: 2 }, orden: 1, activo: true },
      ];

      const rutaMock = {
        id: 1,
        etapas: {
          getItems: vi.fn(() => existingEtapas),
          init: vi.fn().mockImplementation(async function(this: any) { return this; }),
          add: vi.fn(),
        },
      };

      mockEm.findOne.mockResolvedValue(rutaMock);
      mockEm.create.mockReturnValue({ newPivot: true });

      await service.update(1, payload as any);

      expect(mockEm.remove).toHaveBeenCalledWith(existingEtapas[0]);
      expect(mockEm.create).toHaveBeenCalledWith(RutaPasadaEtapa, expect.objectContaining({ etapa: 3 }));
      // assign called only for the parent RutaPasada fields, NOT for any pivot
      expect(mockEm.assign).not.toHaveBeenCalledWith(existingEtapas[0], expect.anything(), expect.anything());
    });

    it('rejects duplicate orden values — throws before opening transaction', async () => {
      const payload = {
        etapas: [
          { etapa: 1, orden: 1, pesoIdeal: 10, pesoMinimo: 9, pesoMaximo: 11, cantidadMuestrasRequeridas: 5 },
          { etapa: 2, orden: 1, pesoIdeal: 20, pesoMinimo: 18, pesoMaximo: 22, cantidadMuestrasRequeridas: 3 },
        ],
      };

      await expect(service.update(1, payload as any)).rejects.toThrow('Duplicate orden values');
      expect(mockEm.transactional).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('rejects duplicate orden values — throws before opening transaction', async () => {
      mockEm.findOne.mockResolvedValue(null);
      const payload = {
        nombre: 'Ruta con orden duplicado',
        etapas: [
          { etapa: 1, orden: 1, pesoIdeal: 10, pesoMinimo: 9, pesoMaximo: 11, cantidadMuestrasRequeridas: 5 },
          { etapa: 2, orden: 1, pesoIdeal: 20, pesoMinimo: 18, pesoMaximo: 22, cantidadMuestrasRequeridas: 3 },
        ],
      };

      await expect(service.create(payload as any)).rejects.toThrow('Duplicate orden values');
      expect(mockEm.transactional).not.toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    it('sets rutaPasada.activo = false but does NOT mutate any pivot record', async () => {
      mockEm.count.mockResolvedValue(0); // no active LineaProduccion references

      const pivotStage1 = { id: 10, orden: 1 };
      const pivotStage2 = { id: 11, orden: 2 };

      const rutaMock = {
        id: 1,
        activo: true,
        etapas: {
          getItems: vi.fn(() => [pivotStage1, pivotStage2]),
          init: vi.fn().mockImplementation(async function(this: any) { return this; }),
        },
      };

      mockEm.findOne.mockResolvedValue(rutaMock);

      const result = await service.softDelete(1);

      expect(result).toBe(true);
      expect(rutaMock.activo).toBe(false);

      // Pivot records must remain untouched — no activo mutation on them
      expect(pivotStage1).not.toHaveProperty('activo', false);
      expect(pivotStage2).not.toHaveProperty('activo', false);

      // The cascade loop must not have called etapas.init()
      expect(rutaMock.etapas.init).not.toHaveBeenCalled();

      expect(mockEm.flush).toHaveBeenCalledOnce();
    });
  });
});
