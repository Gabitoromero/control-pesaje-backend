import { BaseService } from './base.service.js';
import { RutaPasada } from '../models/RutaPasada.js';
import { LineaProduccion } from '../models/LineaProduccion.js';
import { RutaPasadaEtapa } from '../models/RutaPasadaEtapa.js';
import { RestrictError } from '../utils/errors.js';
import { RequiredEntityData } from '@mikro-orm/core';

type RutaPasadaEtapaInput = {
  id?: number;
  etapa: number;
  orden: number;
  pesoIdeal: number;
  pesoMinimo: number;
  pesoMaximo: number;
  cantidadMuestrasRequeridas: number;
  activo?: boolean;
};

export class RutaPasadaService extends BaseService<RutaPasada> {
  constructor() {
    super(RutaPasada);
  }

  override async findAll(): Promise<RutaPasada[]> {
    return this.getEm().find(RutaPasada, { activo: true }, { populate: ['etapas', 'etapas.etapa'] });
  }

  override async findAllInactive(): Promise<RutaPasada[]> {
    return this.getEm().find(RutaPasada, { activo: false }, { populate: ['etapas', 'etapas.etapa'] });
  }

  override async findById(id: number): Promise<RutaPasada | null> {
    return this.getEm().findOne(RutaPasada, { id }, { populate: ['etapas', 'etapas.etapa'] });
  }

  override async create(data: RequiredEntityData<RutaPasada>): Promise<RutaPasada> {
    const em = this.getEm();
    return em.transactional(async (tx) => {
      const { etapas, ...rutaData } = data as RequiredEntityData<RutaPasada> & { etapas?: RutaPasadaEtapaInput[] };
      const entity = tx.create(RutaPasada, rutaData as RequiredEntityData<RutaPasada>);
      
      if (etapas && Array.isArray(etapas)) {
        for (const etapaData of etapas) {
          const pivot = tx.create(RutaPasadaEtapa, Object.assign({}, etapaData, { rutaPasada: entity }) as unknown as RequiredEntityData<RutaPasadaEtapa>);
          entity.etapas.add(pivot);
        }
      }
      
      await tx.flush();
      return entity;
    });
  }

  override async update(id: number, data: Partial<RutaPasada>): Promise<RutaPasada | null> {
    const em = this.getEm();
    return em.transactional(async (tx) => {
      const entity = await tx.findOne(RutaPasada, { id }, { populate: ['etapas'] });
      if (!entity) return null;

      const { etapas, ...rutaData } = data as Partial<RutaPasada> & { etapas?: RutaPasadaEtapaInput[] };
      tx.assign(entity, rutaData);

      if (etapas && Array.isArray(etapas)) {
        const existingEtapas = await entity.etapas.init();
        const existingMap = new Map<number, RutaPasadaEtapa>(existingEtapas.getItems().map((e) => [e.id, e]));

        for (const etapaData of etapas) {
          if (etapaData.id && existingMap.has(etapaData.id)) {
            const existing = existingMap.get(etapaData.id)!;
            tx.assign(existing, etapaData as unknown as Partial<RutaPasadaEtapa>);
            existingMap.delete(etapaData.id);
          } else {
            const pivot = tx.create(RutaPasadaEtapa, Object.assign({}, etapaData, { rutaPasada: entity }) as unknown as RequiredEntityData<RutaPasadaEtapa>);
            entity.etapas.add(pivot);
          }
        }

        // Soft delete remaining
        for (const remaining of existingMap.values()) {
          remaining.activo = false;
        }
      }

      await tx.flush();
      return entity;
    });
  }

  override async softDelete(id: number): Promise<boolean> {
    const em = this.getEm();

    const activeRefs = await em.count(LineaProduccion, { rutaPasadaActiva: { id }, activo: true });
    if (activeRefs > 0) {
      throw new RestrictError(
        `No se puede eliminar la ruta: ${activeRefs} línea(s) activa(s) la tienen asignada`,
      );
    }

    return em.transactional(async (tx) => {
      const entity = await tx.findOne(RutaPasada, { id }, { populate: ['etapas'] });
      if (!entity) return false;

      entity.activo = false;
      
      const etapas = await entity.etapas.init();
      for (const pivot of etapas.getItems()) {
        pivot.activo = false;
      }

      await tx.flush();
      return true;
    });
  }
}
