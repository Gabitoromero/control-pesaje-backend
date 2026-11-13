import { BaseService } from './base.service.js';
import { RutaPasada } from '../models/RutaPasada.js';
import { LineaProduccion } from '../models/LineaProduccion.js';
import { RutaPasadaEtapa } from '../models/RutaPasadaEtapa.js';
import { RestrictError, ValidationError } from '../utils/errors.js';
import { RequiredEntityData, type EntityManager, type ObjectQuery } from '@mikro-orm/core';
import { AtributoEtapaRuta } from '../models/AtributoEtapaRuta.js';
import { MAGNITUD_POR_DEFECTO, MAX_ATRIBUTOS_POR_ETAPA, VALOR_ATRIBUTO_ACEPTADO } from '../shared/constants.js';
import type { AtributoEtapaInput, Magnitud } from '../shared/types/domain.js';

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
  magnitud?: Magnitud;
  atributos?: AtributoEtapaInput[];
};

type AtributoNormalizado = { id?: number; nombre: string; tipo: AtributoEtapaInput['tipo']; minimo: number; maximo: number };

/** Active atributos only: soft-deleted ones are history and never travel in the ruta responses. */
const POPULATE_ETAPAS = ['etapas', 'etapas.etapa', 'etapas.atributos'] as const;
/**
 * An etapa without atributos must still come back: the filter keeps the etapas that have no atributo at all
 * (`id: null`) next to the ones whose atributos are active. A plain `{ activo: true }` drops those etapas.
 */
const ONLY_ACTIVE_ATRIBUTOS = { etapas: { atributos: { $or: [{ id: null }, { activo: true }] } } } as unknown as ObjectQuery<RutaPasada>;

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

/** A brand new etapa measures peso unless told otherwise; an existing one keeps its stored magnitud if none is sent. */
const normalizeMagnitud = (e: RutaPasadaEtapaInput, isNew: boolean): RutaPasadaEtapaInput =>
  isNew && e.magnitud === undefined ? { ...e, magnitud: MAGNITUD_POR_DEFECTO } : e;

/**
 * Validates and normalizes the atributos of one etapa: at most MAX_ATRIBUTOS_POR_ETAPA, unique names
 * (case-insensitive), 'numerico' needs a full range with minimo <= maximo, and 'aceptado' is fixed to 1..1.
 */
const normalizeAtributos = (atributos: AtributoEtapaInput[]): AtributoNormalizado[] => {
  if (atributos.length > MAX_ATRIBUTOS_POR_ETAPA) {
    throw new ValidationError(`An etapa accepts at most ${MAX_ATRIBUTOS_POR_ETAPA} atributos`);
  }
  const nombres = new Set<string>();
  return atributos.map((a) => {
    const nombre = a.nombre.trim();
    const clave = nombre.toLowerCase();
    if (nombres.has(clave)) throw new ValidationError(`Duplicate atributo nombre '${nombre}' in the same etapa`);
    nombres.add(clave);

    if (a.tipo === 'aceptado') {
      return { id: a.id, nombre, tipo: a.tipo, minimo: VALOR_ATRIBUTO_ACEPTADO, maximo: VALOR_ATRIBUTO_ACEPTADO };
    }
    if (a.minimo == null || a.maximo == null) {
      throw new ValidationError(`Atributo '${nombre}': minimo and maximo are required for a numerico atributo`);
    }
    if (a.minimo > a.maximo) {
      throw new ValidationError(`Atributo '${nombre}': minimo must be less than or equal to maximo`);
    }
    return { id: a.id, nombre, tipo: a.tipo, minimo: a.minimo, maximo: a.maximo };
  });
};

const withNormalizedAtributos = (e: RutaPasadaEtapaInput): RutaPasadaEtapaInput =>
  e.atributos === undefined ? e : { ...e, atributos: normalizeAtributos(e.atributos) };

export class RutaPasadaService extends BaseService<RutaPasada> {
  constructor() {
    super(RutaPasada);
  }

  override async findAll(): Promise<RutaPasada[]> {
    return this.getEm().find(RutaPasada, { activo: true }, { populate: POPULATE_ETAPAS, populateWhere: ONLY_ACTIVE_ATRIBUTOS });
  }

  override async findAllInactive(): Promise<RutaPasada[]> {
    return this.getEm().find(RutaPasada, { activo: false }, { populate: POPULATE_ETAPAS, populateWhere: ONLY_ACTIVE_ATRIBUTOS });
  }

  override async findById(id: number): Promise<RutaPasada | null> {
    return this.getEm().findOne(RutaPasada, { id }, { populate: POPULATE_ETAPAS, populateWhere: ONLY_ACTIVE_ATRIBUTOS });
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
    const etapasInput = rawEtapas?.map((e) => withNormalizedAtributos(normalizeMagnitud(normalizeTolerancia(e, true), true)));

    return em.transactional(async (tx) => {
      const etapas = etapasInput;
      const entity = tx.create(RutaPasada, rutaData as RequiredEntityData<RutaPasada>);

      if (etapas && Array.isArray(etapas)) {
        for (const { atributos, ...pivotData } of etapas) {
          const pivot = tx.create(RutaPasadaEtapa, Object.assign({}, pivotData, { rutaPasada: entity }) as unknown as RequiredEntityData<RutaPasadaEtapa>);
          entity.etapas.add(pivot);
          for (const { id: _id, ...a } of (atributos ?? []) as AtributoNormalizado[]) {
            tx.create(AtributoEtapaRuta, { ...a, rutaPasadaEtapa: pivot } as unknown as RequiredEntityData<AtributoEtapaRuta>);
          }
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
    const etapasInput = rawEtapas?.map(withNormalizedAtributos);
    const touchesAtributos = !!etapasInput?.some((e) => e.atributos !== undefined);

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

        for (const rawEtapaData of etapas) {
          const existing = rawEtapaData.id
            ? existingById.get(rawEtapaData.id)
            : existingByEtapaId.get(rawEtapaData.etapa);
          // A brand new etapa defaults to the global tolerance; an existing one keeps its stored value if none is sent.
          const { atributos, ...etapaData } = normalizeMagnitud(normalizeTolerancia(rawEtapaData, !existing), !existing);

          if (existing) {
            const { id: _, toleranciaPct, ...updateData } = etapaData;
            tx.assign(existing, updateData as unknown as Partial<RutaPasadaEtapa>, { convertCustomTypes: true });
            // Set outside assign: convertCustomTypes would run DecimalType.convertToJSValue, and String(null) is 'null'
            if (toleranciaPct !== undefined) existing.toleranciaPct = toleranciaPct;
            if (atributos !== undefined) await this.syncAtributos(tx, existing, atributos as AtributoNormalizado[]);
            existingById.delete(existing.id);
            existingByEtapaId.delete(existing.etapa.id);
          } else {
            const pivot = tx.create(RutaPasadaEtapa, Object.assign({}, etapaData, { rutaPasada: entity }) as unknown as RequiredEntityData<RutaPasadaEtapa>);
            entity.etapas.add(pivot);
            for (const { id: _id, ...a } of (atributos ?? []) as AtributoNormalizado[]) {
              tx.create(AtributoEtapaRuta, { ...a, rutaPasadaEtapa: pivot } as unknown as RequiredEntityData<AtributoEtapaRuta>);
            }
          }
        }

        // Hard delete pivots not present in the payload (soft-delete only applies to parent cascade).
        // An etapa with atributos (even deactivated ones) cannot be removed: atributos are never physically deleted
        // and loaded values must keep pointing at them.
        for (const remaining of existingById.values()) {
          if (remaining.atributos && (await remaining.atributos.init()).getItems().length > 0) {
            throw new ValidationError('No se puede quitar una etapa que tiene cualidades definidas');
          }
        }
        for (const remaining of existingById.values()) {
          tx.remove(remaining);
        }
      }

      await tx.flush();
      // Soft-deleted atributos are still in the loaded collections: reload so the response only carries the active ones.
      if (touchesAtributos) {
        return tx.findOne(RutaPasada, { id }, { populate: POPULATE_ETAPAS, populateWhere: ONLY_ACTIVE_ATRIBUTOS, refresh: true });
      }
      return entity;
    });
  }

  /**
   * Replaces the active atributos of an etapa with the payload: matches by id, creates the ones without id and
   * deactivates (never deletes) the missing ones, so values already loaded keep their atributo.
   */
  private async syncAtributos(tx: EntityManager, pivot: RutaPasadaEtapa, atributos: AtributoNormalizado[]): Promise<void> {
    const actuales = (await pivot.atributos.init()).getItems().filter((a) => a.activo);
    const porId = new Map<number, AtributoEtapaRuta>(actuales.map((a) => [a.id, a]));

    for (const { id: atributoId, ...data } of atributos) {
      if (atributoId === undefined) {
        tx.create(AtributoEtapaRuta, { ...data, rutaPasadaEtapa: pivot } as unknown as RequiredEntityData<AtributoEtapaRuta>);
        continue;
      }
      const existing = porId.get(atributoId);
      if (!existing) throw new ValidationError(`Atributo ${atributoId} does not belong to this etapa`);
      tx.assign(existing, data, { convertCustomTypes: true });
      porId.delete(atributoId);
    }
    for (const sobrante of porId.values()) sobrante.activo = false;
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
