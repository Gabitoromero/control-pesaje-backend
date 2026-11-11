import type { RequestHandler } from 'express';
import { RequestContext } from '@mikro-orm/core';
import { z } from 'zod';
import {
  historialService,
  HISTORIAL_DEFAULT_PAGE_SIZE,
  HISTORIAL_MAX_PAGE_SIZE,
} from '../services/historial.service.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Fecha inválida');

const historialQuerySchema = z.object({
  desde: isoDate.optional(),
  hasta: isoDate.optional(),
  etapaId: z.coerce.number().int().positive().optional(),
  articuloId: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(HISTORIAL_MAX_PAGE_SIZE).default(HISTORIAL_DEFAULT_PAGE_SIZE),
});

// Plant day boundaries, same convention as the reports.
const startOfDay = (iso: string) => new Date(`${iso.split('T')[0]}T00:00:00.000-03:00`);
const endOfDay = (iso: string) => new Date(`${iso.split('T')[0]}T23:59:59.999-03:00`);

/**
 * GET /muestras/historial — history of the authenticated user's own muestras.
 * The user id comes from the JWT; any `usuarioId` query parameter is ignored.
 */
export const getHistorial: RequestHandler = async (req, res) => {
  const parsed = historialQuerySchema.safeParse(req.query);
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
    if (!em) throw new Error('No EntityManager in RequestContext');

    const data = await historialService.list(em, req.user!.id, {
      ...rest,
      desde: desdeDate,
      hasta: hastaDate,
    });
    res.json({ success: true, data });
  } catch {
    res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
  }
};
