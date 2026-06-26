import type { RequestHandler } from 'express';
import type { PasadaService } from '../services/pasada.service.js';
import { UsuarioRol } from '../shared/types.js';

// Shape returned by this factory — only the handlers this controller owns.
// softDelete is delegated to createCrudHandlers (base remove handler).
export interface PasadaHandlers {
  iniciar: RequestHandler;
  list: RequestHandler;
  getOne: RequestHandler;
  update: RequestHandler;
}

export interface IniciarPasadaBody {
  lineaProduccionId: number;
  articuloId: number;
}

export interface UpdatePasadaBody {
  action?: 'completar' | 'abortar';
  motivoCierre?: string;
  [key: string]: unknown;
}

/**
 * Creates HTTP handlers for the Pasada resource.
 * Mirrors the pattern of createLineaProduccionHandlers — thin factory, no logic escapes to routes.
 *
 * Error mapping (per design):
 *   service Error  →  422
 *   null return    →  404
 *   unknown        →  500
 */
export function createPasadaHandlers(service: PasadaService): PasadaHandlers {

  const iniciar: RequestHandler = async (req, res) => {
    try {
      // userId MUST come from the JWT payload, never from the body (REQ-P1)
      const userId = req.user!.id;
      const { lineaProduccionId, articuloId } = req.body as IniciarPasadaBody;

      const pasada = await service.iniciarPasada(lineaProduccionId, articuloId, userId);
      res.status(201).json({ success: true, data: pasada });
    } catch (err) {
      if (err instanceof Error) {
        res.status(422).json({ success: false, error: { message: err.message } });
        return;
      }
      res.status(500).json({ success: false, error: { message: 'Internal server error' } });
    }
  };

  const list: RequestHandler = async (req, res) => {
    try {
      const all = await service.findAllPopulated();

      // Apply in-memory filters from query params (REQ-P2)
      const lineaId = req.query.lineaProduccionId ? Number(req.query.lineaProduccionId) : undefined;
      const articuloId = req.query.articuloId ? Number(req.query.articuloId) : undefined;
      const estado = req.query.estado as string | undefined;

      const filtered = all.filter((pasada) => {
        if (lineaId !== undefined && pasada.lineaProduccion?.id !== lineaId) {
          return false;
        }
        if (articuloId !== undefined && pasada.articulo?.id !== articuloId) {
          return false;
        }
        if (estado !== undefined && pasada.estado !== estado) {
          return false;
        }
        return true;
      });

      res.json({ success: true, data: filtered });
    } catch {
      res.status(500).json({ success: false, error: { message: 'Internal server error' } });
    }
  };

  const getOne: RequestHandler = async (req, res) => {
    const id = Number(req.params.id);
    try {
      const pasada = await service.findById(id);
      if (!pasada) {
        res.status(404).json({ success: false, error: { message: 'Not found' } });
        return;
      }
      res.json({ success: true, data: pasada });
    } catch {
      res.status(500).json({ success: false, error: { message: 'Internal server error' } });
    }
  };

  const update: RequestHandler = async (req, res) => {
    const id = Number(req.params.id);
    const userId = req.user!.id;
    const { action, motivoCierre, ...rest } = req.body as UpdatePasadaBody;

    try {
      if (action === 'completar') {
        // Load the pasada to check ownership (REQ-P4: owner OPERARIO only)
        const pasada = await service.findById(id);
        if (!pasada) {
          res.status(404).json({ success: false, error: { message: 'Not found' } });
          return;
        }

        const ownerId = pasada.usuario?.id;
        if (ownerId !== userId) {
          res.status(403).json({ success: false, error: { message: 'Only the pasada owner can complete it' } });
          return;
        }

        const completed = await service.completarPasada(id);
        res.json({ success: true, data: completed });
        return;
      }

      if (action === 'abortar') {
        // Validate motivoCierre is present (Zod already runs, but guard defensively)
        if (!motivoCierre || motivoCierre.trim().length === 0) {
          res.status(422).json({ success: false, error: { message: 'motivoCierre is required to abort a pasada' } });
          return;
        }

        // Role check: only JEFE or ADMINISTRADOR can abort a pasada (REQ-P5)
        const canAbortar = req.user!.rol === UsuarioRol.JEFE || req.user!.rol === UsuarioRol.ADMINISTRADOR;
        if (!canAbortar) {
          res.status(403).json({ success: false, error: { message: 'Only JEFE or ADMINISTRADOR can abort a pasada' } });
          return;
        }

        // Load pasada to verify it exists before aborting
        const pasada = await service.findById(id);
        if (!pasada) {
          res.status(404).json({ success: false, error: { message: 'Not found' } });
          return;
        }

        const aborted = await service.abortarPasada(id, motivoCierre);
        res.json({ success: true, data: aborted });
        return;
      }

      // Generic field update — no action provided
      const updated = await service.update(id, rest);
      if (!updated) {
        res.status(404).json({ success: false, error: { message: 'Not found' } });
        return;
      }
      res.json({ success: true, data: updated });

    } catch (err) {
      if (err instanceof Error) {
        res.status(422).json({ success: false, error: { message: err.message } });
        return;
      }
      res.status(500).json({ success: false, error: { message: 'Internal server error' } });
    }
  };

  return { iniciar, list, getOne, update };
}
