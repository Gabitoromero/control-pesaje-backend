import type { Request, Response } from 'express';
import { RequestContext } from '@mikro-orm/core';
import { toleranciaConfigService } from '../services/tolerancia-config.service.js';

const INTERNAL_ERROR = { success: false, error: { message: 'Error interno del servidor' } };

export const getToleranciaConfig = async (_req: Request, res: Response): Promise<void> => {
  const em = RequestContext.getEntityManager();
  if (!em) {
    res.status(500).json(INTERNAL_ERROR);
    return;
  }

  try {
    const data = await toleranciaConfigService.get(em);
    if (!data) {
      res
        .status(404)
        .json({ success: false, error: { message: 'Configuracion de tolerancia no encontrada' } });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    console.error('[getToleranciaConfig error]', err);
    res.status(500).json(INTERNAL_ERROR);
  }
};

export const updateToleranciaConfig = async (req: Request, res: Response): Promise<void> => {
  const em = RequestContext.getEntityManager();
  if (!em || !req.user) {
    res.status(500).json(INTERNAL_ERROR);
    return;
  }

  try {
    // Body already validated by validateBody(ToleranciaConfigUpdateSchema).
    const { toleranciaPct } = req.body as { toleranciaPct: number };
    const data = await toleranciaConfigService.update(em, {
      toleranciaPct,
      usuarioId: req.user.id,
    });
    res.json({ success: true, data });
  } catch (err) {
    console.error('[updateToleranciaConfig error]', err);
    res.status(500).json(INTERNAL_ERROR);
  }
};
