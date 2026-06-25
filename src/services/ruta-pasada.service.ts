import { BaseService } from './base.service.js';
import { RutaPasada } from '../models/RutaPasada.js';
import { LineaProduccion } from '../models/LineaProduccion.js';
import { RutaPasadaEtapa } from '../models/RutaPasadaEtapa.js';
import { RestrictError, ValidationError } from '../utils/errors.js';
import { RequiredEntityData } from '@mikro-orm/core';

type RutaPasadaEtapaInput = {
  id?: number;
  etapa: number;
  orden: number;
  pesoIdeal: number;
  pesoMinimo: number;
  pesoMaximo: number;
  cantidadMuestrasRequeridas: number;
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

  private assertUniqueOrden(etapas: RutaPasadaEtapaInput[]): void {
    const ordenes = etapas.map((e) => e.orden);
    if (new Set(ordenes).size !== ordenes.length) {
      throw new ValidationError('Duplicate orden values in etapas: each stage must have a unique order');
    }
  }

  override async create(data: RequiredEntityData<RutaPasada>): Promise<RutaPasada> {
    const em = this.getEm();
    const { etapas: etapasInput, ...rutaData } = data as RequiredEntityData<RutaPasada> & { etapas?: RutaPasadaEtapaInput[] };
    if (etapasInput) this.assertUniqueOrden(etapasInput);

    return em.transactional(async (tx) => {
      const etapas = etapasInput;
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
    const { etapas: etapasInput, ...rutaData } = data as Partial<RutaPasada> & { etapas?: RutaPasadaEtapaInput[] };
    if (etapasInput) this.assertUniqueOrden(etapasInput);

    return em.transactional(async (tx) => {
      const entity = await tx.findOne(RutaPasada, { id }, { populate: ['etapas'] });
      if (!entity) return null;

      const etapas = etapasInput;
      tx.assign(entity, rutaData);

      if (etapas && Array.isArray(etapas)) {
        const existingEtapas = await entity.etapas.init();
        const allItems = existingEtapas.getItems();
        const existingById = new Map<number, RutaPasadaEtapa>(
          allItems.map((e) => [e.id, e]),
        );
        // MikroORM exposes the FK PK even on uninitialized references
        const existingByEtapaId = new Map<number, RutaPasadaEtapa>(
          allItems.map((e) => [e.etapa.id, e]),
        );

        for (const etapaData of etapas) {
          const existing = etapaData.id
            ? existingById.get(etapaData.id)
            : existingByEtapaId.get(etapaData.etapa);

          if (existing) {
            const { id: _, ...updateData } = etapaData;
            tx.assign(existing, updateData as unknown as Partial<RutaPasadaEtapa>, { convertCustomTypes: true });
            existingById.delete(existing.id);
            existingByEtapaId.delete(existing.etapa.id);
          } else {
            const pivot = tx.create(RutaPasadaEtapa, Object.assign({}, etapaData, { rutaPasada: entity }) as unknown as RequiredEntityData<RutaPasadaEtapa>);
            entity.etapas.add(pivot);
          }
        }

        // Hard delete pivots not present in the payload (soft-delete only applies to parent cascade)
        for (const remaining of existingById.values()) {
          tx.remove(remaining);
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
      const entity = await tx.findOne(RutaPasada, { id });
      if (!entity) return false;

      entity.activo = false;

      await tx.flush();
      return true;
    });
  }
}
