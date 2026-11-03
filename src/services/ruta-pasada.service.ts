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
  toleranciaPorDefecto?: boolean;
  toleranciaPct?: number | null;
};

/**
 * Enforces the tolerance rule on an incoming etapa: "por defecto" uses the global value and
 * discards any own percentage; an own tolerance requires a percentage.
 * On update, an etapa that sends neither field keeps its stored tolerance.
 */
const normalizeTolerancia = (e: RutaPasadaEtapaInput, isNew: boolean): RutaPasadaEtapaInput => {
  if (e.toleranciaPorDefecto === undefined) {
    if (e.toleranciaPct != null) {
      throw new ValidationError('toleranciaPct requires toleranciaPorDefecto to be sent as false');
    }
    if (!isNew) return e;
    return { ...e, toleranciaPorDefecto: true, toleranciaPct: null };
  }
  if (e.toleranciaPorDefecto) return { ...e, toleranciaPct: null };
  if (e.toleranciaPct == null) {
    throw new ValidationError('toleranciaPct is required when toleranciaPorDefecto is false');
  }
  return e;
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
    
    if (data.nombre) {
      const existing = await em.findOne(RutaPasada, { nombre: data.nombre });
      if (existing) {
        throw new ValidationError(`Ya existe una ruta con el nombre '${data.nombre}'`);
      }
    }

    const { etapas: rawEtapas, ...rutaData } = data as RequiredEntityData<RutaPasada> & { etapas?: RutaPasadaEtapaInput[] };
    if (rawEtapas) this.assertUniqueOrden(rawEtapas);
    const etapasInput = rawEtapas?.map((e) => normalizeTolerancia(e, true));

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
    
    if (data.nombre) {
      const existing = await em.findOne(RutaPasada, { nombre: data.nombre });
      if (existing && existing.id !== id) {
        throw new ValidationError(`Ya existe una ruta con el nombre '${data.nombre}'`);
      }
    }

    const { etapas: rawEtapas, ...rutaData } = data as Partial<RutaPasada> & { etapas?: RutaPasadaEtapaInput[] };
    if (rawEtapas) this.assertUniqueOrden(rawEtapas);

    return em.transactional(async (tx) => {
      const entity = await tx.findOne(RutaPasada, { id }, { populate: ['etapas'] });
      if (!entity) return null;

      const etapas = rawEtapas;
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

        for (const rawEtapaData of etapas) {
          const existing = rawEtapaData.id
            ? existingById.get(rawEtapaData.id)
            : existingByEtapaId.get(rawEtapaData.etapa);
          // A brand new etapa defaults to the global tolerance; an existing one keeps its stored value if none is sent.
          const etapaData = normalizeTolerancia(rawEtapaData, !existing);

          if (existing) {
            const { id: _, toleranciaPct, ...updateData } = etapaData;
            tx.assign(existing, updateData as unknown as Partial<RutaPasadaEtapa>, { convertCustomTypes: true });
            // Set outside assign: convertCustomTypes would run DecimalType.convertToJSValue, and String(null) is 'null'
            if (toleranciaPct !== undefined) existing.toleranciaPct = toleranciaPct;
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
