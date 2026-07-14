import type { Request, Response, NextFunction } from 'express';
import { RequestContext } from '@mikro-orm/core';
import { deviceRegistryService } from '../services/device-registry.service.js';
import { dashboardService } from '../services/dashboard.service.js';

const EM_ERROR = { success: false, error: { message: 'EntityManager not available' } } as const;

export const getLineas = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const em = RequestContext.getEntityManager();
    if (!em) { res.status(500).json(EM_ERROR); return; }

    const data = await dashboardService.getLineas(em);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const getResumen = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lineaId = Number(req.params.lineaId);
    const em = RequestContext.getEntityManager();
    if (!em) { res.status(500).json(EM_ERROR); return; }

    const resumen = await dashboardService.getResumen(em, lineaId);

    if (resumen === null) {
      res.status(404).json({ success: false, error: { message: 'No hay pasada activa para esta linea' } });
      return;
    }

    // Overlay live device connectivity (side-effecting registry call stays in controller)
    const conectado = deviceRegistryService.hasDeviceForLinea(lineaId);
    res.status(200).json({ success: true, data: { ...resumen, conectado } });
  } catch (err) {
    next(err);
  }
};

export const getKpis = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lineaId = Number(req.params.lineaId);
    const em = RequestContext.getEntityManager();
    if (!em) { res.status(500).json(EM_ERROR); return; }

    const kpis = await dashboardService.getKpis(em, lineaId);

    if (kpis === null) {
      res.status(404).json({ success: false, error: { message: 'No hay pasada activa para esta linea' } });
      return;
    }

    res.status(200).json({ success: true, data: kpis });
  } catch (err) {
    next(err);
  }
};

export const getEtapas = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lineaId = Number(req.params.lineaId);
    const em = RequestContext.getEntityManager();
    if (!em) { res.status(500).json(EM_ERROR); return; }

    const etapas = await dashboardService.getEtapas(em, lineaId);

    if (etapas === null) {
      res.status(404).json({ success: false, error: { message: 'No hay pasada activa para esta linea' } });
      return;
    }

    res.status(200).json({ success: true, data: etapas });
  } catch (err) {
    next(err);
  }
};
