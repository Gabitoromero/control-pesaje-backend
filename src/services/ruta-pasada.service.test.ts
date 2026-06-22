import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RutaPasadaService } from './ruta-pasada.service.js';
import { RutaPasadaEtapa } from '../models/RutaPasadaEtapa.js';

// Mock EntityManager
const mockEm = {
  find: vi.fn(),
  findOne: vi.fn(),
  count: vi.fn(),
  flush: vi.fn(),
  persist: vi.fn().mockReturnThis(),
  create: vi.fn(),
  assign: vi.fn(),
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
    it('creates RutaPasada and its nested etapas within a transaction', async () => {
      const payload = {
        nombre: 'Ruta 1',
        etapas: [
          { articulo: 1, etapa: 2, orden: 1, pesoIdeal: 10, pesoMinimo: 9, pesoMaximo: 11, cantidadMuestrasRequeridas: 5 },
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
      expect(mockEm.create).toHaveBeenCalledWith(RutaPasadaEtapa, expect.objectContaining({ articulo: 1 }));
      expect(rutaMock.etapas.add).toHaveBeenCalledOnce();
      expect(mockEm.flush).toHaveBeenCalledOnce();
      expect(result).toBe(rutaMock);
    });
  });

  describe('update', () => {
    it('updates RutaPasada and reconciles its nested etapas within a transaction', async () => {
      const payload = {
        nombre: 'Ruta 1 Updated',
        etapas: [
          { id: 10, articulo: 1, etapa: 2, orden: 1, pesoIdeal: 15, pesoMinimo: 9, pesoMaximo: 11, cantidadMuestrasRequeridas: 5 }, // Update
          { articulo: 2, etapa: 3, orden: 2, pesoIdeal: 5, pesoMinimo: 4, pesoMaximo: 6, cantidadMuestrasRequeridas: 2 }, // Create
        ],
      };

      const existingEtapas = [
        { id: 10, articulo: 1, etapa: 2, orden: 1, pesoIdeal: 10, activo: true },
        { id: 11, articulo: 3, etapa: 4, orden: 2, pesoIdeal: 20, activo: true }, // To be deleted
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
      expect(mockEm.assign).toHaveBeenCalledWith(existingEtapas[0], expect.objectContaining({ pesoIdeal: 15 }));
      expect(existingEtapas[1].activo).toBe(false); // soft-deleted
      expect(mockEm.create).toHaveBeenCalledWith(RutaPasadaEtapa, expect.objectContaining({ articulo: 2 }));
      expect(mockEm.flush).toHaveBeenCalledOnce();
      expect(result).toBe(rutaMock);
    });
  });

  describe('softDelete', () => {
    it('cascades softDelete to associated pivot stages', async () => {
      mockEm.count.mockResolvedValue(0); // no active LineaProduccion references

      const existingEtapas = [
        { id: 10, activo: true },
        { id: 11, activo: true },
      ];

      const rutaMock = { 
        id: 1, 
        activo: true,
        etapas: { 
          getItems: vi.fn(() => existingEtapas),
          init: vi.fn().mockImplementation(async function(this: any) { return this; }),
        } 
      };

      mockEm.findOne.mockResolvedValue(rutaMock);

      const result = await service.softDelete(1);

      expect(result).toBe(true);
      expect(rutaMock.activo).toBe(false);
      expect(existingEtapas[0].activo).toBe(false);
      expect(existingEtapas[1].activo).toBe(false);
      expect(mockEm.flush).toHaveBeenCalledOnce(); // from BaseService
    });
  });
});
