import type { RequestHandler } from 'express';
import { RequestContext } from '@mikro-orm/core';
import { z } from 'zod';
import {
  listHistorialCambio,
  HISTORIAL_CAMBIO_DEFAULT_PAGE_SIZE,
  HISTORIAL_CAMBIO_MAX_PAGE_SIZE,
} from '../services/historial-cambio.service.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Fecha inválida');

const querySchema = z.object({
  raizTipo: z.enum(['articulo', 'ruta', 'etapa', 'linea']),
  raizId: z.coerce.number().int().positive(),
  usuarioId: z.coerce.number().int().positive().optional(),
  desde: isoDate.optional(),
  hasta: isoDate.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(HISTORIAL_CAMBIO_MAX_PAGE_SIZE).default(HISTORIAL_CAMBIO_DEFAULT_PAGE_SIZE),
});

// Plant day boundaries, same convention as the reports.
const startOfDay = (iso: string) => new Date(`${iso.split('T')[0]}T00:00:00.000-03:00`);
const endOfDay = (iso: string) => new Date(`${iso.split('T')[0]}T23:59:59.999-03:00`);

/** GET /historial-cambios — audit trail of one root record (admin and jefe only, enforced in the router). */
export const getHistorialCambios: RequestHandler = async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { message: parsed.error.issues[0]?.message ?? 'Parámetros inválidos' } });
    return;
  }

  const { desde, hasta, ...rest } = parsed.data;
  const desdeDate = desde ? startOfDay(desde) : undefined;
  const hastaDate = hasta ? endOfDay(hasta) : undefined;
  if ((desdeDate && isNaN(desdeDate.getTime())) || (hastaDate && isNaN(hastaDate.getTime()))) {
    res.status(400).json({ success: false, error: { message: 'Fechas inválidas' } });
    return;
  }
  if (desdeDate && hastaDate && desdeDate > hastaDate) {
    res.status(400).json({ success: false, error: { message: 'La fecha desde no puede ser posterior a hasta' } });
    return;
  }

  try {
    const em = RequestContext.getEntityManager();
    if (!em) throw new Error('No EntityManager in request context');
    const data = await listHistorialCambio(em, { ...rest, desde: desdeDate, hasta: hastaDate });
    res.json({ success: true, data });
  } catch {
    res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
  }
};
