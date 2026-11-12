import type { EntityManager, FilterQuery } from '@mikro-orm/core';
import { HistorialCambio } from '../models/HistorialCambio.js';

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
      ? { id: r.usuario.id, nombreApellido: r.usuario.nombreApellido, nombreUsuario: r.usuario.nombreUsuario }
      : null,
  }));

  return { items, total, page: q.page, pageSize: q.pageSize };
};
