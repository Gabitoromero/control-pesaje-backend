import type { EntityManager, FilterQuery } from '@mikro-orm/core';
import { HistorialCambio } from '../models/HistorialCambio.js';
import { Articulo } from '../models/Articulo.js';
import { Balanza } from '../models/Balanza.js';
import { Etapa } from '../models/Etapa.js';
import { RutaPasada } from '../models/RutaPasada.js';
import { RutaPasadaEtapa } from '../models/RutaPasadaEtapa.js';
import { ArticuloRutaPasada } from '../models/ArticuloRutaPasada.js';

export const HISTORIAL_CAMBIO_DEFAULT_PAGE_SIZE = 20;
export const HISTORIAL_CAMBIO_MAX_PAGE_SIZE = 100;

export interface HistorialCambioQuery {
  raizTipo: string;
  raizId: number;
  usuarioId?: number;
  desde?: Date;
  hasta?: Date;
  page: number;
  pageSize: number;
}

type Label = (e: never) => string;

/** Fields in `antes`/`despues` that hold the id of another entity, and how to name it for a human. */
const REFERENCE_FIELDS: Record<string, { entity: new () => { id: number }; label: Label }> = {
  articulo: { entity: Articulo, label: ((a: Articulo) => (a.nombre ? `${a.codigo} - ${a.nombre}` : a.codigo)) as Label },
  etapa: { entity: Etapa, label: ((e: Etapa) => e.nombre) as Label },
  rutaPasada: { entity: RutaPasada, label: ((r: RutaPasada) => r.nombre) as Label },
  rutaPasadaActiva: { entity: RutaPasada, label: ((r: RutaPasada) => r.nombre) as Label },
  balanza: { entity: Balanza, label: ((b: Balanza) => b.nombre) as Label },
};

/** Resolves referenced ids to their current human name: { field: { id: label } }. Ids that no longer exist are omitted. */
export const resolveReferences = async (
  em: EntityManager,
  changes: { antes: Record<string, unknown>; despues: Record<string, unknown> }[],
): Promise<Record<string, Record<string, string>>> => {
  const idsByField = new Map<string, Set<number>>();
  for (const c of changes) {
    for (const side of [c.antes, c.despues]) {
      for (const [field, value] of Object.entries(side)) {
        if (REFERENCE_FIELDS[field] && typeof value === 'number') {
          if (!idsByField.has(field)) idsByField.set(field, new Set());
          idsByField.get(field)!.add(value);
        }
      }
    }
  }
  const result: Record<string, Record<string, string>> = {};
  for (const [field, ids] of idsByField) {
    const { entity, label } = REFERENCE_FIELDS[field];
    const found = await em.find(entity as never, { id: { $in: [...ids] } } as never);
    result[field] = Object.fromEntries((found as unknown as { id: number }[]).map((e) => [String(e.id), (label as (e: unknown) => string)(e)]));
  }
  return result;
};

/** Nested entities whose changes are ambiguous on their own: which etapa / articulo of the ruta is it? */
const CONTEXT_FIELDS: Record<string, { field: 'etapa' | 'articulo'; entity: new () => { id: number }; ownerOf: (row: never) => number | undefined }> = {
  ruta_etapa: { field: 'etapa', entity: RutaPasadaEtapa, ownerOf: ((r: RutaPasadaEtapa) => r.etapa?.id) as never },
  ruta_articulo: { field: 'articulo', entity: ArticuloRutaPasada, ownerOf: ((r: ArticuloRutaPasada) => r.articulo?.id) as never },
};

interface ChangeLike { id: number; entidad: string; entidadId: number; antes: Record<string, unknown>; despues: Record<string, unknown> }

/**
 * Names the etapa/articulo a nested change refers to. A diff only carries the fields that changed, so
 * editing a tolerance says nothing about which etapa it was: look it up from the (possibly deleted) row.
 */
export const resolveContextos = async (em: EntityManager, items: ChangeLike[]) => {
  const ref = new Map<number, { field: 'etapa' | 'articulo'; id: number }>();
  const missing = new Map<string, { entity: new () => { id: number }; ownerOf: (row: never) => number | undefined; ids: Set<number> }>();
  for (const it of items) {
    const cfg = CONTEXT_FIELDS[it.entidad];
    if (!cfg) continue;
    const inline = it.despues[cfg.field] ?? it.antes[cfg.field];
    if (typeof inline === 'number') ref.set(it.id, { field: cfg.field, id: inline });
    else {
      if (!missing.has(it.entidad)) missing.set(it.entidad, { entity: cfg.entity, ownerOf: cfg.ownerOf, ids: new Set() });
      missing.get(it.entidad)!.ids.add(it.entidadId);
    }
  }
  for (const [entidad, m] of missing) {
    const rows = (await em.find(m.entity as never, { id: { $in: [...m.ids] } } as never)) as unknown as { id: number }[];
    const owner = new Map(rows.map((r) => [r.id, m.ownerOf(r as never)]));
    for (const it of items) {
      if (it.entidad !== entidad || ref.has(it.id)) continue;
      const id = owner.get(it.entidadId);
      if (id !== undefined) ref.set(it.id, { field: CONTEXT_FIELDS[entidad].field, id });
    }
  }
  return ref;
};

/** Changes of a root record (including its nested entities), newest first. */
export const listHistorialCambio = async (em: EntityManager, q: HistorialCambioQuery) => {
  const where: FilterQuery<HistorialCambio> = { raizTipo: q.raizTipo, raizId: q.raizId };
  if (q.usuarioId) where.usuario = q.usuarioId;
  if (q.desde || q.hasta) {
    where.fecha = { ...(q.desde ? { $gte: q.desde } : {}), ...(q.hasta ? { $lte: q.hasta } : {}) };
  }

  const [rows, total] = await em.findAndCount(HistorialCambio, where, {
    populate: ['usuario'],
    orderBy: { fecha: 'DESC', id: 'DESC' },
    limit: q.pageSize,
    offset: (q.page - 1) * q.pageSize,
  });

  const items = rows.map((r) => ({
    id: r.id,
    entidad: r.entidad,
    entidadId: r.entidadId,
    raizTipo: r.raizTipo,
    raizId: r.raizId,
    accion: r.accion,
    fecha: r.fecha,
    antes: r.antes,
    despues: r.despues,
    usuario: r.usuario
      ? {
          id: r.usuario.id,
          nombreApellido: r.usuario.nombreApellido,
          nombreUsuario: r.usuario.nombreUsuario,
          sector: r.usuario.datosAdicionales?.sector ?? null,
        }
      : null,
  }));

  const contextRefs = await resolveContextos(em, items);
  const synthetic = [...contextRefs.values()].map((c) => ({ antes: {}, despues: { [c.field]: c.id } }));
  const referencias = await resolveReferences(em, [...items, ...synthetic]);
  const itemsWithContexto = items.map((it) => {
    const c = contextRefs.get(it.id);
    const contexto = c ? referencias[c.field]?.[String(c.id)] : undefined;
    return contexto ? { ...it, contexto } : it;
  });

  return { items: itemsWithContexto, referencias, total, page: q.page, pageSize: q.pageSize };
};
